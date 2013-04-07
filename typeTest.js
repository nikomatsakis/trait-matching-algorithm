(function typesWithDifferentIdsCannotUnify() {
  expectResult(false, function() {
    var env = new Environment();
    var t1 = new Type("Foo", []);
    var t2 = new Type("Bar", []);
    return env.unify(t1, t2);
  });
})();

(function typesWithSameIdCanUnify() {
  expectResult(true, function() {
    var env = new Environment();
    var t1 = new Type("Foo", []);
    var t2 = new Type("Foo", []);
    return env.unify(t1, t2);
  });
})();

(function unifyParameters() {
  expectResult(false, function() {
    var env = new Environment();
    var t1 = new Type("Foo", []);
    var t2 = new Type("Bar", []);
    var t3 = new Type("Foo", [t1]);
    var t4 = new Type("Foo", [t2]);
    return env.unify(t3, t4);
  });
})();

(function unifyTwoVariables() {
  expectResult(true, function() {
    var env = new Environment();
    var v1 = env.freshVariable();
    var v2 = env.freshVariable();
    return env.unify(v1, v2);
  });
})();

(function unifyVariableAndType() {
  expectResult(true, function() {
    var env = new Environment();
    var v1 = env.freshVariable();
    var t1 = new Type("Foo", []);
    return env.unify(v1, t1) && env.unify(t1, v1);
  });
})();

(function unifyVariableAndTwoTypes() {
  expectResult(true, function() {
    var env = new Environment();
    var v1 = env.freshVariable();
    var t1 = new Type("Foo", []);
    var t2 = new Type("Bar", []);
    return env.unify(v1, t1) && !env.unify(t2, v1);
  });
})();

(function unifyVariableAndTwoTypes() {
  expectResult(true, function() {
    var env = new Environment();
    var v1 = env.freshVariable();
    var v2 = env.freshVariable();
    var t1 = new Type("Foo", []);
    var t2 = new Type("Bar", []);
    return (env.unify(v1, v2) &&
            env.unify(v2, t1) &&
            !env.unify(v1, t2) &&
            !env.unify(v2, t2));
  });
})();

(function unifyVariableAndRollback() {
  expectSuccess(function() {
    var env = new Environment();
    var v1 = env.freshVariable();
    var t1 = new Type("Foo", []);
    var t2 = new Type("Bar", []);

    assertEq(true, env.probe(() => env.unify(v1, t1)));
    assertEq(true, env.probe(() => env.unify(v1, t2)));
    assertEq(false, env.probe(() => env.unify(v1, t1) && env.unify(v1, t2)));
  });
})();

printSummary();
