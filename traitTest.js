load("testLib.js");
load("type.js");
load("trait.js");

(function basicSuccess() {
  expectSuccess(function() {
    var intType = new Type("int", []);
    var floatType = new Type("float", []);
    var fooType = new Type("foo", []);

    var env = new Environment();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      new Impl("ToStrFloat", [], new TraitReference("ToStr", [], floatType))
    ]);

    var result =
      resolve(program, env, [
        new Obligation("ToStr/int", new TraitReference("ToStr", [], intType)),
        new Obligation("ToStr/float", new TraitReference("ToStr", [], floatType)),
        new Obligation("ToStr/str", new TraitReference("ToStr", [], fooType))
      ]);

    var expectedResult =
      {
        "confirmed": [
          {
            "impl": "ToStrInt",
            "obligation": "ToStr/int"
          },
          {
            "impl": "ToStrFloat",
            "obligation": "ToStr/float"
          }
        ],
        "deferred": [],
        "errors": [
          {
            "obligation": "ToStr/str",
            "traitReference": {
              "id": "ToStr",
              "selfType": {
                "id": "foo",
                "typeParameters": []
              },
              "typeParameters": []
            }
          }
        ]
      };

    DEBUG(JSON.stringify(result, undefined, 2));
    assertEq(JSON.stringify(expectedResult, undefined, 2),
             JSON.stringify(result, undefined, 2));
  });
})();

(function genericImpl() {
  // test an `impl<T> ToStr for List<T>` and check that it
  // can match `List<int>` but not `List<foo>`
  expectSuccess(function() {
    var intType = new Type("int", []);
    var fooType = new Type("foo", []);
    var listType = t => new Type("list", [t]);
    var p0Type = new TypeParameter(0);
    var p0Def = new TypeParameterDef(0, [new TraitReference("ToStr", [], p0Type)]);

    var env = new Environment();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      new Impl("ToStrList", [p0Def], new TraitReference("ToStr", [], listType(p0Type)))
    ]);

    var result =
      resolve(program, env, [
        new Obligation("ToStr(List<int>)", new TraitReference("ToStr", [], listType(intType))),
        new Obligation("ToStr(List<foo>)", new TraitReference("ToStr", [], listType(fooType)))
      ]);

    var expectedResult = {
      "confirmed": [
        {
          "impl": "ToStrList",
          "obligation": "ToStr(List<int>)"
        },
        {
          "impl": "ToStrList",
          "obligation": "ToStr(List<foo>)"
        },
        {
          "impl": "ToStrInt",
          "obligation": "ToStr(List<int>).0"
        }
      ],
      "deferred": [],
      "errors": [
        {
          "obligation": "ToStr(List<foo>).0",
          "traitReference": {
            "id": "ToStr",
            "selfType": {
              "index": 1,
              "value": {
                "id": "foo",
                "typeParameters": []
              }
            },
            "typeParameters": []
          }
        }
      ]
    };

    assertEq(JSON.stringify(expectedResult, undefined, 2),
             JSON.stringify(result, undefined, 2));
  })
})();

(function duplicateImpl() {
  // In this test, there are two identical impls, so we get an
  // ambiguous result.
  expectSuccess(function() {
    var intType = new Type("int", []);

    var env = new Environment();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType))
    ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("ToStr", [], intType))
      ]);

    var expectedResult = {
      confirmed: [],
      deferred: ["A"],
      errors: []
    };

    assertEq(JSON.stringify(expectedResult, undefined, 2),
             JSON.stringify(result, undefined, 2));
  })
})();

(function insufficientTypeInformation() {
  // In this test, there are two impls and a type variable,
  // we can infer nothing about the value of the type variable
  expectSuccess(function() {
    var env = new Environment();

    var intType = new Type("int", []);
    var floatType = new Type("float", []);
    var varType = env.freshVariable();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      new Impl("ToStrFloat", [], new TraitReference("ToStr", [], floatType))
    ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("ToStr", [], varType))
      ]);

    var expectedResult = {
      confirmed: [],
      deferred: ["A"],
      errors: []
    };

    assertEq(JSON.stringify(expectedResult, undefined, 2),
             JSON.stringify(result, undefined, 2));
    assertEq(varType.isBound(),
             false);
  })
})();

(function basicInference() {
  // In this test, there is only one impl, so we infer that the
  // fresh type variable must be an integer
  expectSuccess(function() {
    var env = new Environment();

    var intType = new Type("int", []);
    var varType = env.freshVariable();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
    ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("ToStr", [], varType))
      ]);

    var expectedResult = {
      confirmed: [{impl: "ToStrInt", obligation: "A"}],
      deferred: [],
      errors: []
    };

    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
    assertEq(JSON.stringify(varType.resolve()),
             JSON.stringify(intType));
  })
})();

(function iteratorInference() {
  // In this test, we have a type List<int> that needs to implement
  // Iterable<V0>.  Because there is only one impl of Iterable for List,
  // we are able to infer that V0 is int.
  expectSuccess(function() {
    var env = new Environment();

    var intType = new Type("int", []);
    var listType = t => new Type("list", [t]);
    var arrayType = t => new Type("array", [t]);
    var varType = env.freshVariable();
    var p0Type = new TypeParameter(0);
    var p0Def = new TypeParameterDef(0, []);

    var program = new Program([
      new Impl("IterableList", [p0Def], new TraitReference("Iterable", [p0Type], listType(p0Type))),
      new Impl("IterableArray", [p0Def], new TraitReference("Iterable", [p0Type], arrayType(p0Type)))
    ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("Iterable", [varType], listType(intType)))
      ]);

    var expectedResult = {
      confirmed: [{impl: "IterableList", obligation: "A"}],
      deferred: [],
      errors: []
    };

    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
    assertEq(JSON.stringify(varType.resolve()),
             JSON.stringify(intType));
  })
})();

(function ambigInference() {
  // In this test, we require that str implements Iterable<V0>, but
  // because str implements both Iterable<char> and Iterable<u8> we
  // are not able to infer the type of V0.
  expectSuccess(function() {
    var env = new Environment();

    var u8Type = new Type("u8", []);
    var charType = new Type("char", []);
    var strType = new Type("str", []);
    var varType = env.freshVariable();
    var p0Type = new TypeParameter(0);
    var p0Def = new TypeParameterDef(0, []);

    var program = new Program([
      new Impl("IterableChar", [], new TraitReference("Iterable", [charType], strType)),
      new Impl("IterableByte", [], new TraitReference("Iterable", [u8Type], strType)),
    ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("Iterable", [varType], strType))
      ]);

    var expectedResult = {
      confirmed: [],
      deferred: ["A"],
      errors: []
    };

    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
    assertEq(varType.isBound, false);
  })
})();


printSummary();
