// The base trait resolution algorithm.
//
// Requires: type.js

function DEBUG() {
  // print.apply(null, arguments);
}

///////////////////////////////////////////////////////////////////////////
// Trait -- definition of a trait. For our purposes, we only care about
// the name, arity, and list of methods.
//
// NB: The implicit `Self` type parameter is considered to be #arity.
// In other words, if we have: `trait Foo<A,B>` then parameter 0 is A,
// parameter 1 is B, and parameter 2 is Self.

function Trait(id, fundeps, methods) {
  this.id = id; // trait name, a string
  this.fundeps = fundeps; // [bool] -> true if type parameter is an IN parameter
  this.arity = fundeps.length; // number of type parameters
  this.methods = methods; // [Method]
}

Trait.prototype.param_is_input = function(i) {
  // True if param #i is an "input"
  return this.fundeps[i];
};

Trait.prototype.freshReference = function(env, selfType) {
  var parameters = env.freshVariables(this.arity - 1);
  return new TraitReference(this.id, parameters, selfType);
};

Trait.prototype.hasMethodNamed = function(name) {
  return this.methods.filter(p => p.id === name).length !== 0;
};

Trait.prototype.methodNamed = function(name) {
  return this.methods.filter(p => p.id === name)[0];
};

///////////////////////////////////////////////////////////////////////////
// Method -- definition of a method. For our purposes, we only care about
// the name and explicit self decl.

function Method(id, selfType) {
  this.id = id;
  this.selfType = selfType; // Type referencing the `Self` type parameter
}

Method.prototype = {
  toString: function() {
    return this.id + "(self: " + this.selfType + ", ...) -> ...";
  }
};

///////////////////////////////////////////////////////////////////////////
// An Obligation indicates a trait reference that must be resolved to
// an impl. So, for example, if the user uses calls `show(x)` where
// `x` is an `int` and `show` has the type `<T:Show> fn(T)` then this
// will entail an obligation `Show for int` (actually `Show for int @
// 0`, which includes a depth, see below).

function Obligation(id, traitReference, depth) {
  // `id`: A unique identifier for this obligation. Primarily for
  // debugging, but also used to communicate results from the trait
  // resolution algorithm.
  this.id = id;

  // `traitReference`: The trait reference that we must resolve to
  // an impl. For example, `Show for Int`.
  this.traitReference = traitReference;

  // `depth`: Track the depth of the obligation resolution stack. If
  // resolving this obligation entails further obligations, they will
  // have an increased depth -- if the depth gets too deep, we give
  // up.  This is needed because trait resolution is not decidable.
  this.depth = depth;
}

Obligation.prototype.toString = function() {
  return "<" + this.id + "@" + this.traitReference + "@" + this.depth + ">";
};

///////////////////////////////////////////////////////////////////////////
// A trait reference is the combination of a trait with the values of
// its type parameters (e.g., `Iterable<int> for Vec<int>`).

function TraitReference(id, typeParameters, selfType) {
  // Trait<P0...PN> for Type
  this.id = id; // trait name, a string
  this.selfType = selfType; // Type
  this.typeParameters = typeParameters; // [Type]
}

TraitReference.prototype.subst = function(replacements) {
  return new TraitReference(this.id,
                            this.typeParameters.map(p => p.subst(replacements)),
                            this.selfType.subst(replacements));
};

TraitReference.prototype.resolve = function() {
  return new TraitReference(this.id,
                            this.typeParameters.map(p => p.resolve()),
                            this.selfType.resolve());
};

TraitReference.prototype.isFullyBound = function() {
  // Hokey, but resolving will throw an error if there are any unbound
  // type variables floating about.
  try {
    this.resolve();
    return true;
  } catch (e) {
    return false;
  }
};

TraitReference.prototype.toString = function() {
  if (this.typeParameters.length > 0) {
    return this.id+"<"+this.typeParameters+" for "+this.selfType+">";
  } else {
    return this.id+"<for "+this.selfType+">";
  }
};

///////////////////////////////////////////////////////////////////////////

function Impl(id, parameterDefs, traitReference) {
  // impl<V1...Vn> Trait<P0...PN> for Type
  this.id = id; // unique string, line number, whatever
  this.parameterDefs = parameterDefs; // [TypeParameterDef]
  this.numVariables = parameterDefs.length;
  this.traitReference = traitReference; // [TraitReference]
}

///////////////////////////////////////////////////////////////////////////

function Program(traits,impls) {
  this.traits = traits; // [Trait]
  this.impls = impls;   // [Impl]
}

///////////////////////////////////////////////////////////////////////////

function ResolveResult(confirmed, deferred, overflow, noImpl) {
  this.confirmed = confirmed;
  this.deferred = deferred;
  this.overflow = overflow;
  this.noImpl = noImpl;
}

ResolveResult.prototype = {
  toString: function() {
    return JSON.stringify({
      confirmed: this.confirmed.map(
        c => c.obligation.id + " -> " + c.impl + "<" + c.replacements + ">"),
      deferred: this.deferred.map(o => o.id),
      overflow: this.overflow.map(o => o.id),
      noImpl: this.noImpl.map(o => o.id)
    });
  }
};

///////////////////////////////////////////////////////////////////////////
// resolve(P, E, O) -- the main resolve algorithm. Takes a program P,
// a unification/typing environment E, and a list of obligations
// O. Attempts to resolve each obligation in O to an impl. This may in
// turn create other obligations that must be resolved. For example,
// given the obligation `O0: Bar for int @ 0` and `I0: impl<T:Foo> Bar
// for T`, we might confirm the impl `I0` for `O0`, but creates a new
// obligation `O0.0: Foo for int @ 1`. Note that the depth of this
// nested obligation is increased, and the `id` is modified to have a
// `.0` appended.
//
// Returns four lists:
//
// - `confirmed: [{impl: <impl-id>, obligation: <obligation-id>}]` A
//   list of obligations that were definitely mapped to an impl.
//
// - `deferred: [obligation]` A list of obligations where we could
//   not resolve to a particular impl nor rule out that an impl may exist.
//   This can occur because of unresolved inference variables.
//
// - `overflow: [obligation]` A list of obligations
//   where the depth became too high. Increasing the maximum depth may
//   permit these obligations to be resolved.
//
// - `noImpl: [obligation]`
//   A list of trait references for which we can definitely say no impl
//   exists. This is possible because of coherence rules and our closed
//   world assumption.
//
// The general algorithm is *basically* a DFS:
// - We start out with our base list of obligations.
// - We iterate over this list:
//   - For each obligation, we will try to narrow down the set of
//     impls to exactly one that might possibly apply:
//     - First, we determine the set of impls whose types can be
//       unified with the types in the obligation.
//     - If this set has size 1, we're done. Look below to the confirm step.
//     - Otherwise, we rule out those impls in the set where we can
//       determine that a recursive bound cannot apply.
//     - If this set has size 1, we're done. Look below to the confirm step.
//     - If this set has size > 1, we do not yet have sufficient type
//       information, so we mark the obligation as DEFERRED and move
//       on to the next.
//     - If this set has size 0, it's possible that this impl cannot ever
//       be resolved. To determine this, we check whether the types have
//       any unresolved inference variables:
//       - If they do, then the obligation is DEFERRED. After all,
//         it's possible that another crate could come along,
//         implement a new type and then impl any required traits for
//         it, and that would be the value the for those inference
//         variables.
//       - Otherwise, the impl is marked as NO_IMPL.
//     - Confirmation: if at any point we reached a set of viable impls
//       of size 1, we mark the obligation as CONFIRMED and push any
//       nested obligations onto our list of obligations to resolve.
// - The algorithm terminates when everything on the obligations list
//   has been processed.

MAX_OBLIGATION_DEPTH = 4 // prevent overflow

function resolve(program, environment, obligations0) {
  // create our own copy of the obligations list, as we will be growing it
  var obligations = obligations0.slice();

  var confirmed = [];
  var deferred = [];
  var overflow = [];
  var noImpl = [];

  for (var i = 0; i < obligations.length; i++) {
    var obligation = obligations[i];
    var pendingTraitReference = obligation.traitReference;

    DEBUG("obligation", obligation);

    DEBUG("pendingTraitReference", pendingTraitReference);

    if (obligation.depth > MAX_OBLIGATION_DEPTH) {
      overflow.push(obligation);
      continue;
    }

    // First round. Try to unify types.
    var candidateImpls = program.impls.filter(impl => {
      if (impl.traitReference.id !== pendingTraitReference.id)
        return false;

      return environment.probe(() => {
        return instantiateAndUnify(environment, impl, pendingTraitReference) != null;
      });
    });

    // For better error messages, check now if there is exactly one candidate.
    // See test `genericImpl` for an example where this makes a difference;
    // we report an error for failing to find an impl for string, and not
    // list<string>
    if (candidateImpls.length == 1) {
      confirmCandidate(
        environment, candidateImpls[0], obligation,
        confirmed, obligations);
      continue;
    }

    // Second round. Multiple (or zero) unifiable candidate impls
    // exist. Examine nested obligations recursively and remove any
    // for which the nested obligations cannot be met.
    var candidateImplsRound2 = candidateImpls.filter(candidateImpl => {
      return environment.probe(() => {
        DEBUG("pendingTraitReference", pendingTraitReference,
              "candidateImpl", candidateImpl);

        var [candidateDeferred, _] =
          candidateObligations(
            environment, candidateImpl, obligation);
        var candidateResult = resolve(program, environment, candidateDeferred);
        return (candidateResult.noImpl.length == 0);
      });
    });

    if (candidateImplsRound2.length == 1) {
      // Exactly one viable.
      confirmCandidate(
        environment, candidateImplsRound2[0], obligation,
        confirmed, obligations);
    } else {
      // Either no impls or multiple impls still viable. We wish
      // to distinguish between two cases:
      //
      // - noImpl: there is no implementation and there can never be
      // - deferred: we did not yet find a definitive implementation,
      //   but given more type information *or more impls*, we might yet
      //   find one.
      //
      // The interesting point is that even if there are zero viable
      // candidates, if there are unbound type variables in the
      // `obligation.traitReference` than it is possible for some other
      // crate to come around, define new types, and then implement
      // the trait for those types, and hence we must consider this obligation
      // as *deferred*.

      if (candidateImplsRound2.length == 0 &&
          obligation.traitReference.isFullyBound())
        noImpl.push(obligation);
      else
        deferred.push(obligation);
    }
  }

  return new ResolveResult(confirmed, deferred, overflow, noImpl);
}

function instantiateAndUnify(environment, impl, pendingTraitReference) {
  // instantiateAndUnify(E, I, T) -- Given an impl definition and a
  // trait reference:
  //
  //    I = impl<A...> Trait<TypeP...> for TypeS
  //    T = Trait<TypeQ...> for TypeT
  //
  // Returns either null or a substitution Theta such that
  //
  //    Theta TypeP == TypeQ && Theta TypeS == TypeT

  var freshVariables = environment.freshVariables(impl.numVariables);
  var implTraitReference = impl.traitReference.subst(freshVariables, null);

  DEBUG("freshVariables", freshVariables);
  DEBUG("implTraitReference", implTraitReference);

  if (!environment.unifyTraitReferences(implTraitReference,
                                        pendingTraitReference))
    return null;

  return freshVariables;
}

function implObligations(base_id, depth, impl, replacements) {
  // Returns the nested obligations implied by `impl` using the
  // substitution `replacements`. The id and depth for these new
  // obligations will be derived from `base_id` and `depth`.

  var obligations = [];
  impl.parameterDefs.forEach(parameterDef => {
    parameterDef.bounds.forEach((bound, index) => {
      var bound = bound.subst(replacements, null);
      obligations.push(new Obligation(base_id+"."+index, bound, depth));
    });
  });
  return obligations;
}

function candidateObligations(environment, candidateImpl, obligation) {
  // candidateImpl(E, I, O) -- Given an environment E, impl I, and obligation O:
  //
  //    I = impl<A: Trait1<..>, ...> Trait<TypeP...> for TypeS
  //    O = id @ Trait<TypeQ, ...> for TypeT @ depth
  //
  // which are known to be unifiable (see `instantiateAndUnify()`),
  // instantiates the bounds like `Trait1<..>` that appear on the
  // impl's return parameters. Hence in this case it might return:
  //
  //    [id.0 @ Trait1<..> for TypeQ, ...]

  var traitReference = obligation.traitReference;
  var replacements = instantiateAndUnify(environment, candidateImpl, traitReference);
  return [implObligations(obligation.id, obligation.depth+1,
                          candidateImpl, replacements),
          replacements];
}

function confirmCandidate(environment, candidateImpl, obligation,
                          confirmed, obligations) {
  // This function is called when the resolve process has been able
  // narrow down the set of viable impls to exactly one. Note that we
  // do not necessarily yet know if the nested obligations entailed by
  // this impl can be resolved. All we can say is that if this impl
  // doesn't work, no other impl will.
  //
  // This process then pushes the impl-obligation pair onto the `confirmed`
  // list and then pushes any nested obligations onto the list `obligations`
  // to be recursively processed.

  var [newObligations, replacements] =
    candidateObligations(environment, candidateImpl, obligation);
  confirmed.push({impl: candidateImpl.id,
                  replacements: replacements,
                  obligation: obligation})
  obligations.push.apply(obligations, newObligations);
}
