// Requires: type.js

function DEBUG() {
  // print.apply(null, arguments);
}

///////////////////////////////////////////////////////////////////////////

function Obligation(id, traitReference) {
  this.id = id;
  this.traitReference = traitReference;
}

Obligation.prototype.toString = function() {
  return "<" + this.id + "@" + this.traitReference + ">";
};

///////////////////////////////////////////////////////////////////////////

function TraitReference(id, typeParameters, selfType) {
  // Trait<P0...PN> for Type
  this.id = id; // string
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

TraitReference.prototype.toString = function() {
  if (this.typeParameters.length > 0) {
    return this.id+"<self="+this.selfType+",tps="+this.typeParameters+">";
  } else {
    return this.id+"<self="+this.selfType+">";
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

function Program(impls) {
  this.impls = impls // [Impl]
}

///////////////////////////////////////////////////////////////////////////

function resolve(program, environment, obligations0) {
  // create our own copy of the obligations list, as we will be growing it
  var obligations = obligations0.slice();

  var confirmed = [];
  var deferred = [];
  var errors = [];

  for (var i = 0; i < obligations.length; i++) {
    var obligation = obligations[i];
    var pendingTraitReference = obligation.traitReference;

    DEBUG("obligation", obligation);

    DEBUG("pendingTraitReference", pendingTraitReference);

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

    // Second round. Examine other obligations.
    var candidateImplsRound2 = candidateImpls.filter(candidateImpl => {
      return environment.probe(() => {
        DEBUG("pendingTraitReference", pendingTraitReference,
              "candidateImpl", candidateImpl);

        var candidateDeferred =
          candidateObligations(
            environment, candidateImpl, obligation);
        var candidateResult = resolve(program, environment, candidateDeferred);
        return (candidateResult.errors.length == 0);
      });
    });

    if (candidateImplsRound2.length == 0) {
      // Nothing viable.
      errors.push({obligation: obligation.id,
                   traitReference: pendingTraitReference});
    } else if (candidateImplsRound2.length == 1) {
      // Exactly one viable.
      confirmCandidate(
        environment, candidateImplsRound2[0], obligation,
        confirmed, obligations);
    } else {
      // Multiple still viable.
      deferred.push(obligation.id);
    }
  }

  return {confirmed: confirmed,
          deferred: deferred,
          errors: errors};
}

function instantiateAndUnify(environment, impl, pendingTraitReference) {
  var freshVariables = environment.freshVariables(impl.numVariables);
  var implTraitReference = impl.traitReference.subst(freshVariables);

  DEBUG("freshVariables", freshVariables);
  DEBUG("implTraitReference", implTraitReference);

  if (!environment.unify(implTraitReference.selfType,
                         pendingTraitReference.selfType))
    return null;

  var numTypeParameters = implTraitReference.typeParameters.length;
  if (numTypeParameters != pendingTraitReference.typeParameters.length)
    throw new Error("Inconsistent number of type parameters: " +
                    implTraitReference + " vs " +
                    pendingTraitReference);

  for (var k = 0; k < numTypeParameters; k++) {
    if (!environment.unify(implTraitReference.typeParameters[k],
                           pendingTraitReference.typeParameters[k]))
      return null;
  }

  return freshVariables;
}

function implObligations(base_id, impl, replacements) {
  var obligations = [];
  impl.parameterDefs.forEach(parameterDef => {
    parameterDef.bounds.forEach((bound, index) => {
      var bound = bound.subst(replacements);
      obligations.push(new Obligation(base_id+"."+index, bound));
    });
  });
  return obligations;
}

function candidateObligations(environment, candidateImpl, obligation) {
  var traitReference = obligation.traitReference;
  var replacements = instantiateAndUnify(environment, candidateImpl, traitReference);
  return implObligations(obligation.id, candidateImpl, replacements);
}

function confirmCandidate(environment, candidateImpl, obligation,
                          confirmed, obligations) {
  confirmed.push({impl: candidateImpl.id,
                  obligation: obligation.id})
  obligations.push.apply(
    obligations,
    candidateObligations(environment, candidateImpl, obligation));
}
