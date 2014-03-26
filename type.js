///////////////////////////////////////////////////////////////////////////
// A simple unification-style inference engine

function Environment(typeParameterDefs) {
  this.numberTypeVariables = 0;
  this.boundVariables = [];
  this.typeParameterDefs = typeParameterDefs || [];
}

Environment.prototype.freshVariable = function() {
  var index = this.numberTypeVariables++;
  return new TypeVariable(index);
};

Environment.prototype.freshVariables = function(number) {
  var result = [];
  for (var i = 0; i < number; i++)
    result.push(this.freshVariable());
  return result;
};

Environment.prototype.unify = function(type1, type2) {
  // Top-level routine to unify two types
  return type1.unify(this, type2);
};

Environment.prototype.unifyTraitReferences = function(traitRef1, traitRef2) {
  if (!this.unify(traitRef1.selfType, traitRef2.selfType))
    return false;

  var numTypeParameters = traitRef1.typeParameters.length;
  if (numTypeParameters != traitRef2.typeParameters.length)
    throw new Error("Inconsistent number of type parameters: " +
                    traitRef1 + " vs " + traitRef2);

  for (var k = 0; k < numTypeParameters; k++)
    if (!this.unify(traitRef1.typeParameters[k], traitRef2.typeParameters[k]))
      return false;

  return true;
}

Environment.prototype.snapshot = function() {
  return {numberTypeVariables: this.numberTypeVariables,
          boundVariablesLength: this.boundVariables.length};
};

Environment.prototype.attempt = function(closure) {
  // Execute `closure` provisionally; if `closure` returns something false-y,
  // any bindings created will be undone
  var snapshot = this.snapshot();
  var r = closure();
  if (r)
    return r;
  this.rollback(snapshot);
  return r;
};

Environment.prototype.probe = function(closure) {
  // Execute `closure` but always undoes any bindings it creates
  var snapshot = this.snapshot();
  var result = closure();
  this.rollback(snapshot);
  return result;
};

Environment.prototype.rollback = function(snapshot) {
  // Rolls back any bindings that have occurred since `length`
  this.numberTypeVariables = snapshot.numberTypeVariables;
  while (this.boundVariables.length > snapshot.boundVariablesLength) {
    var variable = this.boundVariables.pop();
    variable.unbind();
  }
};

Environment.prototype.recordBinding = function(variable) {
  this.boundVariables.push(variable);
};

///////////////////////////////////////////////////////////////////////////

function Type(id, typeParameters) {
  // id<T0...Tn>
  this.id = id; // string
  this.typeParameters = typeParameters; // [Type]
}

Type.prototype.toString = function() {
  if (this.typeParameters.length === 0)
    return this.id;

  var result = this.id + "<";
  for (var i = 0; i < this.typeParameters.length; i++) {
    result += this.typeParameters[i].toString();
  }
  result += ">";
  return result;
};

Type.prototype.unify = function(environment, otherType) {
  return otherType.unifyWithType(environment, this);
};

Type.prototype.unifyWithType = function(environment, otherType) {
  if (this.id !== otherType.id)
    return false;

  if (this.typeParameters.length !== otherType.typeParameters.length)
    throw new Error("Inconsistent number of type parameters: " +
                    this.toString() + " vs " + otherType.toString());

  return environment.attempt(() => {
    for (var i = 0; i < this.typeParameters.length; i++) {
      if (!environment.unify(this.typeParameters[i], otherType.typeParameters[i]))
        return false;
    }

    return true;
  });
};

Type.prototype.unifyWithUnboundTypeVariable = function(environment, variable) {
  return variable.unifyWithType(environment, this);
}

Type.prototype.resolve = function() {
  return new Type(this.id, this.typeParameters.map(p => p.resolve()));
};

Type.prototype.subst = function(replacements) {
  return new Type(this.id, this.typeParameters.map(p => p.subst(replacements)));
};

Type.prototype.meetsNominalPredicate = function(predicate) {
  return predicate(this.id);
};

///////////////////////////////////////////////////////////////////////////

var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function TypeParameterDef(index, bounds) {
  // <Pn:bounds>
  assertEq(true, bounds !== undefined);
  this.index = index;
  this.bounds = bounds; // TraitReference
}

TypeParameterDef.prototype.toString = function() {
  return "<" + ALPHABET[this.index] + ":" + this.bounds + ">";
};

///////////////////////////////////////////////////////////////////////////

function TypeParameter(index) {
  // Pn
  this.index = index;
}

TypeParameter.prototype.toString = function() {
  return ALPHABET[this.index];
};

TypeParameter.prototype.unify = function(environment, otherType) {
  throw new Error("Unsubstituted type parameter: " + this);
};

TypeParameter.prototype.unifyWithType = function(environment, otherType) {
  throw new Error("Unsubstituted type parameter: " + this);
};

TypeParameter.prototype.unifyWithUnboundTypeVariable = function(environment, variable) {
  throw new Error("Unsubstituted type parameter: " + this);
};

TypeParameter.prototype.subst = function(replacements) {
  return replacements[this.index];
};

///////////////////////////////////////////////////////////////////////////

function TypeVariable(index) {
  this.index = index;
  this.value = null;
}

TypeVariable.prototype.bind = function(environment, value) {
  assertEq(this.value, null);
  environment.recordBinding(this);
  this.value = value;
};

TypeVariable.prototype.unbind = function() {
  this.value = null;
};

TypeVariable.prototype.unify = function(environment, otherType) {
  if (this.value) {
    return environment.unify(this.value, otherType);
  } else {
    return otherType.unifyWithUnboundTypeVariable(environment, this);
  }
};

TypeVariable.prototype.unifyWithType = function(environment, otherType) {
  if (this.value) {
    return environment.unify(this.value, otherType);
  } else {
    this.bind(environment, otherType);
    return true;
  }
};

TypeVariable.prototype.unifyWithUnboundTypeVariable = function(environment, variable) {
  if (this.value) {
    return environment.unify(this.value, variable);
  } else {
    this.bind(environment, variable);
    return true;
  }
};

TypeVariable.prototype.isBound = function() {
  return !!this.value;
};

TypeVariable.prototype.resolve = function() {
  if (!this.value)
    throw new Error("Unbound type variable " + this.toString());
  return this.value.resolve();
};

TypeVariable.prototype.toString = function() {
  if (!this.value)
    return "${"+this.index+"}";
  return "${"+this.index+":"+this.value+"}";
};

TypeVariable.prototype.subst = function(replacements) {
  throw new Error("Substituting type variable: " + this);
};

TypeVariable.prototype.meetsNominalPredicate = function(predicate) {
  if (!this.value)
    return false;
  return tihs.value.meetsNominalPredicate(predicate);
};

