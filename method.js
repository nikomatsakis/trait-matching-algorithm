// Method resolution rules.
//
// Requires: type.js
// Requires: trait.js

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
// Adjustments
//
// Tracks the adjustment(s) that had to be applied to the receiver.

function DerefAdjustment(traitName, resolveResults) {
  this.traitName = traitName;
  this.resolveResults = resolveResults;
}

DerefAdjustment.prototype.toString = function() {
  return "DerefAdjustment(" + this.traitName + ")";
};

RefAdjustment = {
  toString: function() {
    return "RefAdjustment()";
  }
};

RefMutAdjustment = {
  toString: function() {
    return "RefMutAdjustment()";
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

function Ambiguous(applicableTraits) {
  this.applicableTraits = applicableTraits;
}

Ambiguous.prototype = {
  success: false,

  toString: function() {
    return "Ambiguous(" + this.applicableTraits + ")";
  }
};

function Match(traitRef, adjustments, results) {
  this.traitRef = traitRef;
  this.adjustments = to_array(adjustments);
  this.results = results;

  function to_array(conslist) {
    var x = [];
    while (conslist) {
      x.push(conslist[0]);
      conslist = conslist[1];
    }
    return x;
  }
}

Match.prototype = {
  success: true,

  toString: function() {
    return "Match(" + this.adjustments + ", " + this.traitRef + ")";
  }
};

///////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////
//

function resolveMethod(program, env, receiverType, traits, methodName) {
  var mcx = new MethodContext(program, env, traits, methodName);
  return mcx.resolve([receiverType, null], null);
}

function MethodContext(program, env, traits, methodName) {
  this.program = program;
  this.env = env;
  this.traits = traits;
  this.methodName = methodName;
}

MethodContext.prototype = {
  resolve: function(types, adjustments) {
    // Resolves a method call `receiver.method(...)`, taking into
    // account auto-deref rules and so forth.

    // Filter out those traits that definitely cannot apply to `receiverType`.
    var applicableTraits = this.traits.filter(trait => {
      return trait.hasMethodNamed(this.methodName) && this.env.probe(() => {
        var [_, results] = this.resolveMethodTrait(types[0], trait);
        var noImpl = results.noImpl;
        return noImpl.length === 0; // Keep if we cannot rule it out.
      });
    });

    // No matching traits. Try dereferencing `receiverType` and search again.
    if (applicableTraits.length === 0) {
      return this.resolveAfterDeref(types, adjustments);
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
    var [traitRef, results] = this.resolveMethodTrait(types[0], trait);
    assertEq(results.noImpl.length, 0);

    // Now we must reconcile against the self type.
    return new Match(traitRef, adjustments, results);
  },

  resolveAfterDeref: function(types, adjustments) {
    var [t, a] = this.tryDeref(types[0]);
    if (t == null)
      return new CannotDeref(types[0]);

    return this.resolve([t, types], [a, adjustments]);
  },

  resolveMethodTrait: function(selfType, trait) {
    var traitRef = trait.freshReference(this.env, selfType);
    var obligation = new Obligation("method", traitRef, 0);
    return [traitRef, resolve(this.program, this.env, [obligation])];
  },

  tryDeref: function(selfType) {
    var traitRef = DEREF_TRAIT.freshReference(this.env, selfType);
    var obligation = new Obligation("deref", traitRef, 0);
    var results = resolve(this.program, this.env, [obligation]);

    // Deref trait *definitely* definitely not implemented:
    if (results.noImpl.length !== 0)
      return [null, null];

    // Deref trait not known to be implemented:
    if (results.confirmed.length === 0)
      return [null, null];

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
    var derefdType = traitRef.typeParameters[0];
    return [derefdType, new DerefAdjustment(DEREF_TRAIT.id, derefdType)];
  },

  reconcileSelfType: function(adjustments, types, methodDecl, traitRef, results) {
    print("reconcileSelfType", adjustments, types, methodDecl, traitRef);
    var selfType = methodDecl.selfType.subst(traitRef.typeParameters);
    print("selfType", selfType);

    // Check whether the type T works; if so, we know what adjustments
    // were needed.
    if (env.attempt(() => selfType.unify(types[0])))
      return new Match(traitRef, adjustments, results);

    // Attempt an &ref.
    var refType = Ref(types[0]);
    if (env.attempt(() => selfType.unify(refType)))
      return new Match(traitRef, [RefAdjustment, adjustments], results);

    // Attempt an &mut ref.
    var refMutType = RefMut(types[0]);
    if (env.attempt(() => selfType.unify(refMutType))) {
      var mutAdjustments = this.makeMutable(adjustments);
      return new Match(traitRef, [RefMutAdjustment, mutAdjustments], results);
    }
  },

  makeMutable: function(adjustments, types) {
  }
};
