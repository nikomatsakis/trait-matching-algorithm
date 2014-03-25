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

function NoAdjustment(type) {
  this.type = type;
}

NoAdjustment.prototype.toString = function() {
  return "NoAdjustment(" + this.type + ")";
};

function DerefAdjustment(type, baseAdjustment, traitName, resolveResults) {
  this.type = type;
  this.baseAdjustment = baseAdjustment;
  this.traitName = traitName;
  this.resolveResults = resolveResults;
}

DerefAdjustment.prototype.toString = function() {
  return "DerefAdjustment(" +
    this.baseAdjustment + ", " +
    this.traitName + ", " +
    this.implId + " -> " +
    this.type + ")";
};

function RefAdjustment(type, baseAdjustment, mutability) {
  this.type = type;
  this.baseAdjustment = baseAdjustment;
  this.mutability = mutability;
}

RefAdjustment.prototype.toString = function() {
  return "RefAdjustment(" +
    this.baseAdjustment + ", " +
    this.mutability + " -> " +
    this.type + ")";
};

///////////////////////////////////////////////////////////////////////////
// Method Resolution Result

function CannotDeref(adjustedType) {
  this.adjustedType = adjustedType;
  this.success = false;
}

CannotDeref.prototype = {
  toString: function() {
    return "CannotDeref(" + this.adjustedType + ")";
  }
};

function Ambiguous(applicableTraits) {
  this.applicableTraits = applicableTraits;
  this.success = false;
}

Ambiguous.prototype = {
  toString: function() {
    return "Ambiguous(" + this.applicableTraits + ")";
  }
};

function Match(adjustedType, confirmed, deferred, overflow) {
  this.adjustedType = adjustedType;
  this.confirmed = confirmed;
  this.deferred = deferred;
  this.overflow = overflow;
  this.success = true;
}

Match.prototype = {
  toString: function() {
    return "Match(" + this.adjustedType + ")";
  }
};

///////////////////////////////////////////////////////////////////////////
//

function resolveMethod(program, env, receiverType, traits, methodName) {
  return resolveMethod1(program, env, new NoAdjustment(receiverType),
                        traits, methodName);
}

function resolveMethod1(program, env, adjustedType, traits, methodName) {
  // Resolves a method call `receiver.method(...)`, taking into
  // account auto-deref rules and so forth.
  //
  // # Arguments
  //
  // - `adjustedType`: the AdjustedType of the receiver (!)
  // - `traits`: the in-scope `Trait` objects that define the method
  //   being called.
  //
  // # Returns

  // Filter out those traits that definitely cannot apply to `receiverType`.
  var applicableTraits = traits.filter(trait => {
    return env.probe(() => {
      var results = resolveMethodTrait(program, env, adjustedType, trait);
      print(JSON.stringify(results));
      var noImpl = results.noImpl;
      return noImpl.length === 0; // Keep if we cannot rule it out.
    });
  });

  // No matching traits. Try dereferencing `receiverType` and search again.
  if (applicableTraits.length === 0) {
    var derefAdjustedType = derefAdjustment(program, env, adjustedType, traits);
    if (derefAdjustedType == null)
      return new CannotDeref(adjustedType);

    return resolveMethod1(program, env, derefAdjustedType, traits, methodName);
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
  var results = resolveMethodTrait(program, env, adjustedType, trait);
  assertEq(results.noImpl.length, 0);
  return new Match(adjustedType, results.confirmed,
                   results.deferred, results.overflow);
}

function resolveMethodTrait(program, env, adjustedType, trait) {
  var traitRef = trait.freshReference(env, adjustedType.type);
  var obligation = new Obligation("method", traitRef, 0);
  return resolve(program, env, [obligation]);
}

function derefAdjustment(program, env, adjustedType, traits) {
  var traitRef = DEREF_TRAIT.freshReference(env, adjustedType.type);
  var obligation = new Obligation("deref", traitRef, 0);
  var results = resolve(program, env, [obligation]);

  // Deref trait *definitely* definitely not implemented:
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
  var derefdType = traitRef.typeParameters[0];
  return new DerefAdjustment(derefdType, adjustedType, DEREF_TRAIT, results);
}
