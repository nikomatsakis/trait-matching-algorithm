// Method resolution rules.
//
// Requires: type.js
// Requires: trait.js

function MDEBUG() {
  //print.apply(null, arguments);
}

///////////////////////////////////////////////////////////////////////////
// Some builtin types and the builtin deref traits

// &T
var Ref = t => new Type("Ref", [t]);

// &mut T
var RefMut = t => new Type("RefMut", [t]);

// trait Deref<A> { fn deref<'a>(&'a mut self) -> &'a mut A }
var DEREF_TRAIT = new Trait("Deref", [false, true], [
  new Method("deref", Ref(new TypeParameter(1)))
]);


// trait DerefMut<A> { fn deref_mut<'a>(&'a mut self) -> &'a mut A }
var DEREF_MUT_TRAIT = new Trait("DerefMut", [false, true], [
  new Method("deref_mut", Ref(TypeParameter(1)))
]);

///////////////////////////////////////////////////////////////////////////
// Adjusted type
//
// As we process the method call, we will track the implicit
// adjustments that we made to the receiver in order to make the types
// line up.
//
// AT =          -> ty        // No adjustments applied
//    |* imm AT  -> ty        // Applied imm deref trait to yield `ty`
//    | * mut AT -> ty        // Applied mut deref trait to yield `ty`
//    | & imm AT -> ty        // Took reference to yield `ty`
//    | & mut AT -> ty        // Took mutable reference to yield `ty`
//
// Tracks the adjustment(s) that had to be applied to the receiver.

function Unadjusted(type) {
  this.type = type;
}

Unadjusted.prototype = {
  toString: function() {
    return this.type.toString();
  }
};

function Dereferenced(input, traitRef, resolveResults) {
  this.input = input;
  this.type = traitRef.typeParameters[0];

  this.traitRef = traitRef;
  this.resolveResults = resolveResults;
}

Dereferenced.prototype = {
  isMutable: function() {
    return this.traitRef.id === DEREF_MUT_TRAIT.id;
  },

  toString: function() {
    if (this.isMutable())
      return "*mut " + this.input.toString();
    else
      return "*" + this.input.toString();
  }
};

function Referenced(input) {
  this.input = input;
  this.type = Ref(input.type);
}

Referenced.prototype = {
  toString: function() {
    return "&" + this.input;
  }
};

function MutReferenced(input) {
  this.input = input;
  this.type = RefMut(input.type);
}

MutReferenced.prototype = {
  toString: function() {
    return "&mut " + this.input;
  }
};

///////////////////////////////////////////////////////////////////////////
// Method Resolution Result

function CannotDeref(type) {
  this.type = type;
}

CannotDeref.prototype = {
  success: false,

  toString: function() {
    return "CannotDeref(" + this.type + ")";
  }
};

function CannotRefMut(adjusted) {
  this.adjusted = adjusted;
}

CannotRefMut.prototype = {
  success: false,

  toString: function() {
    return "CannotRefMut(" + this.adjusted + ")";
  }
};

function Ambiguous(applicableTraits) {
  this.applicableTraits = applicableTraits;
}

Ambiguous.prototype = {
  success: false,

  toString: function() {
    return "Ambiguous(" + this.applicableTraits + ")";
  }
};

function Match(traitRef, adjusted, results) {
  this.traitRef = traitRef;
  this.adjusted = adjusted;
  this.results = results;
}

Match.prototype = {
  success: true,

  toString: function() {
    return "Match(" + this.adjusted + ", " + this.traitRef + ")";
  }
};

///////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////
//

function resolveMethod(program, env, receiverType, traits, methodName) {
  var mcx = new MethodContext(program, env, traits, methodName);
  return mcx.resolve(new Unadjusted(receiverType));
}

function MethodContext(program, env, traits, methodName) {
  this.program = program;
  this.env = env;
  this.traits = traits;
  this.methodName = methodName;
}

MethodContext.prototype = {
  resolve: function(adjusted) {
    MDEBUG("resolve", adjusted);

    // Resolves a method call `receiver.method(...)`, taking into
    // account auto-deref rules and so forth.

    // Filter out those traits that definitely cannot apply to `receiverType`.
    var applicableTraits = this.traits.filter(trait => {
      return trait.hasMethodNamed(this.methodName) && this.env.probe(() => {
        var [_, results] = this.resolveMethodTrait(adjusted, trait);
        var noImpl = results.noImpl;
        return noImpl.length === 0; // Keep if we cannot rule it out.
      });
    });

    // No matching traits. Try dereferencing `receiverType` and search again.
    if (applicableTraits.length === 0) {
      return this.resolveAfterDeref(adjusted);
    }

    // Multiple potential matching traits.
    if (applicableTraits.length > 1) {
      return new Ambiguous(applicableTraits);
    }

    // Exactly one matching trait. Rerun the resolve algorithm this time
    // without a probe and return the result.
    //
    // NB: coherence guarantees us a unique impl, but only if we impose
    // some sort of functional dependency rule!
    assertEq(applicableTraits.length, 1);
    var trait = applicableTraits[0];
    var [traitRef, results] = this.resolveMethodTrait(adjusted, trait);
    assertEq(results.noImpl.length, 0);

    // Now we must reconcile against the self type.
    var methodDecl = trait.methodNamed(this.methodName);
    return this.reconcileSelfType(adjusted, methodDecl, traitRef, results);
  },

  resolveAfterDeref: function(adjusted) {
    MDEBUG("resolveAfterDeref", adjusted);

    var dereferenced = this.tryDeref(adjusted, DEREF_TRAIT);
    if (dereferenced == null)
      return new CannotDeref(adjusted.type);

    return this.resolve(dereferenced);
  },

  resolveMethodTrait: function(adjusted, trait) {
    MDEBUG("resolveMethodTrait", adjusted, trait);

    var traitRef = trait.freshReference(this.env, adjusted.type);
    var obligation = new Obligation("method", traitRef, 0);
    return [traitRef, resolve(this.program, this.env, [obligation])];
  },

  tryDeref: function(adjusted, trait) {
    MDEBUG("tryDeref", adjusted, trait.id);

    var traitRef = trait.freshReference(this.env, adjusted.type);
    var obligation = new Obligation("deref", traitRef, 0);
    var results = resolve(this.program, this.env, [obligation]);

    // Deref trait *definitely* not implemented:
    if (results.noImpl.length !== 0)
      return null;

    // Deref trait not known to be implemented:
    if (results.confirmed.length === 0)
      return null;

    // NB. I am going from (e.g.) `GC<T>` to `T`, when in fact the
    // deref methods returns `&T`. I think that as far as logic goes,
    // we want the "type" of `*gc` (where `gc:GC<T>`) to be `T`, not
    // `&T`. In other words, the `&T` that is returned is *always*
    // adjusted by a single deref, and we don't go off searching for a
    // method on `&T` itself.
    //
    // Note: the method we find may, in fact, have an `&self`
    // receiver, in which case we will autoref. No prob.

    // NB -- Again here, given fundeps, coherence guarantees us a unique impl
    return new Dereferenced(adjusted, traitRef, results);
  },

  reconcileSelfType: function(adjusted, methodDecl, traitRef, results) {
    MDEBUG("reconcileSelfType", adjusted, methodDecl, traitRef);

    var selfType = methodDecl.selfType.subst(traitRef.typeParameters,
                                             traitRef.selfType);

    MDEBUG("selfType", selfType);

    // Check whether the type T works; if so, we know what adjustments
    // were needed.
    if (this.env.attempt(() => selfType.unify(this.env, adjusted.type)))
      return new Match(traitRef, adjusted, results);

    // Attempt an &ref.
    var refType = Ref(adjusted.type);
    if (this.env.attempt(() => selfType.unify(this.env, refType)))
      return new Match(traitRef, new Referenced(adjusted), results);

    // Attempt an &mut ref.
    var refMutType = RefMut(adjusted.type);
    if (this.env.attempt(() => selfType.unify(this.env, refMutType))) {
      var mutAdjusted = adjusted.makeMutable(this);
      if (!mutAdjusted)
        return new CannotRefMut(adjusted);

      return new Match(traitRef, new MutReferenced(mutAdjusted), results);
    }
  },
};

Unadjusted.prototype.makeMutable = function(mcx) {
  return this;
};

Dereferenced.prototype.makeMutable = function(mcx) {
  if (this.isMutable())
    return this;

  var mutInput = this.input.makeMutable(mcx);
  if (!mutInput)
    return null;

  return mcx.tryDeref(mutInput, DEREF_MUT_TRAIT);
};

Referenced.prototype.makeMutable = function(mcx) {
  var mutInput = this.input.makeMutable(mcx);
  if (!mutInput)
    return null;
  return MutReferenced(mutInput);
};

MutReferenced.prototype.makeMutable = function(mcx) {
  return this;
};
