// Requires: type.js

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

function TypeParameterDef(bounds) {
  // <T:bounds>
  this.bounds = bounds;
}

TypeParameterDef.prototype.toString = function() {
  return "<"+this.bounds+">";
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

function resolve(program, environment, pendingTraitReferences) {
  var confirmed = [];
  var deferred = [];
  var errors = [];

  for (var i = 0; i < pendingTraitReferences.length; i++) {
    var pendingTraitReference = pendingTraitReferences[i];

    print("pendingTraitReference", pendingTraitReference);

    // First round. Try to unify types.
    var candidateImpls = program.impls.filter(impl => {
      if (impl.traitReference.id !== pendingTraitReference.id)
        return false;

      return environment.probe(() => {
        return instantiateAndUnify(environment, impl, pendingTraitReference) != null;
      });
    });

    // For better error messages, check now if there is exactly one candidate.
    if (candidateImpls.length == 1) {
      confirmCandidate(
        environment, candidateImpls[0], pendingTraitReference,
        confirmed, pendingTraitReferences);
      continue;
    }

    // Second round. Examine other obligations.
    var candidateImplsRound2 = candidateImpls.filter(candidateImpl => {
      return environment.probe(() => {
        var candidateDeferred =
          candidateObligations(
            environment, candidateImpl, pendingTraitReference);
        var candidateResult = resolve(program, environment, candidateDeferred);
        return (candidateResult.errors.length == 0);
      });
    });

    if (candidateImplsRound2.length == 0) {
      // Nothing viable.
      errors.push(pendingTraitReference);
    } else if (candidateImplsRound2.length == 1) {
      // Exactly one viable.
      confirmCandidate(
        environment, candidateImplsRound2[0], pendingTraitReference,
        confirmed, pendingTraitReferences);
    } else {
      // Multiple still viable.
      deferred.push(pendingTraitReference);
    }
  }

  return {confirmed: confirmed,
          deferred: deferred,
          errors: errors};
}

function instantiateAndUnify(environment, impl, pendingTraitReference) {
  var freshVariables = environment.freshVariables(impl.numVariables);
  var implTraitReference = impl.traitReference.subst(freshVariables);

  print("freshVariables", freshVariables);
  print("implTraitReference", implTraitReference);

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

function implObligations(impl, replacements) {
  var obligations = [];
  impl.parameterDefs.forEach(parameterDef => {
    parameterDef.bounds.forEach(bound => {
      var bound = bound.subst(replacements);
      obligations.push(bound);
    });
  });
  return obligations;
}

function candidateObligations(environment, candidateImpl, traitReference) {
  var replacements = instantiateAndUnify(environment, candidateImpl, traitReference);
  return implObligations(candidateImpl, replacements);
}

function confirmCandidate(environment, candidateImpl, traitReference,
                          confirmed, pendingTraitReferences) {
  confirmed.push({impl: candidateImpl,
                  traitReference: traitReference});
  pendingTraitReferences.push.apply(
    pendingTraitReferences,
    candidateObligations(environment, candidateImpl, traitReference));
}
