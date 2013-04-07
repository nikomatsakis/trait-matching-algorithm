///////////////////////////////////////////////////////////////////////////
// A simple unification-style inference engine

function Environment() {
  this.numberTypeVariables = 0;
  this.boundVariables = [];
}

Environment.prototype.freshVariable = function() {
  var index = this.numberTypeVariables++;
  return new TypeVariable(index);
};

Environment.prototype.unify = function(type1, type2) {
  // Top-level routine to unify two types
  return type1.unify(this, type2);
};

Environment.prototype.attempt = function(closure) {
  // Execute `closure` provisionally; if `closure` returns false,
  // any bindings created will be undone
  var numBindings = this.boundVariables.length;
  if (closure())
    return true;
  this.rollback(numBindings);
  return false;
};

Environment.prototype.probe = function(closure) {
  // Execute `closure` but always undoes any bindings it creates
  var numBindings = this.boundVariables.length;
  var result = closure();
  this.rollback(numBindings);
  return result;
};

Environment.prototype.rollback = function(length) {
  // Rolls back any bindings that have occurred since `length`
  while (this.boundVariables.length > length) {
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
  if (!this.typeParameters)
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
  return this.value;
};

TypeVariable.prototype.toString = function() {
  return "<T"+this.index+":"+this.value+">";
};
