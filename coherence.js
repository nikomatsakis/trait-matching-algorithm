// Requires type.js, trait.js

function coherenceCheck(program) {
  var conflicts = [];
  for (var i = 0; i < program.impls.length; i++) {
    var implI = program.impls[i];

    for (var j = i + 1; j < program.impls.length; j++) {
      var implJ = program.impls[j];

      // impl of different traits, no conflict
      if (implI.traitReference.id !== implJ.traitReference.id)
        continue;

      // test whether the type parameters are unifiable
      if (implCanSatisfy(program, implI, implJ) ||
          implCanSatisfy(program, implJ, implI))
        conflicts.push([implI.id, implJ.id]);
    }
  }

  return conflicts;
}

function implCanSatisfy(program, implI, implJ) {
  // Given two impls:
  //
  // ImplI: impl<I0...IN> Trait<ParametersI> for TypeI
  // ImplJ: impl<J0...JN> Trait<ParametersJ> for TypeJ
  //
  // Returns true if there exists a substition ThetaI and ThetaJ such that
  //   ThetaI ParametersI == ThetaJ ParametersJ &&
  //   ThetaJ TypeI == ThetaJ TypeJ
  // and where `ThetaI ParametersI` meets the bounds on `I0...IN`
  // and `ThetaJ ParametersJ` meets the bounds on `J0...JN`.
  //
  // In other words, returns true if these two impls could both be
  // used to implement `Trait` for the same set of types. This is a
  // coherence violation.

  var env = new Environment();

  // first, instantiate fresh variables for each impl's type parameters
  var variablesI = env.freshVariables(implI.parameterDefs.length);
  var traitReferenceI = implI.traitReference.subst(variablesI, null);
  var variablesJ = env.freshVariables(implJ.parameterDefs.length);
  var traitReferenceJ = implJ.traitReference.subst(variablesJ, null);

  // check whether the types in the two trait refs can be unified
  if (!env.unifyTraitReferences(traitReferenceI, traitReferenceJ))
    return false;

  // we have found a set of types that appear to satisfy both
  // impls, but do they satisfy the *bounds*?
  if (!substCouldSatisfyImplBounds(program, env, implI, variablesI) ||
      !substCouldSatisfyImplBounds(program, env, implJ, variablesJ))
    return false;

  return true;
}

function substCouldSatisfyImplBounds(program, env, impl, variables) {
  var obligations = [];
  var traitReference = impl.traitReference.subst(variables, null);
  impl.parameterDefs.forEach((parameterDef, parameterIndex) => {
    parameterDef.bounds.forEach((bound, boundIndex) => {
      bound = bound.subst(variables, null);
      obligations.push(new Obligation("[P=" + parameterIndex + "," +
                                      "B=" + boundIndex + "]",
                                      bound,
                                      0));
    });
  });

  var result = resolve(program, env, obligations);

  // Unless we saw any cases where the impl could never be satisfied,
  // conservatively indicate that the substitution MIGHT satisfy the
  // impl bounds.
  return result.noImpl.length === 0;
}
