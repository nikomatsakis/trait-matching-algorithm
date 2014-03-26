load("testLib.js");
load("type.js");
load("trait.js");

(function basicSuccess() {
  expectSuccess(function() {
    var intType = new Type("int", []);
    var floatType = new Type("float", []);
    var fooType = new Type("foo", []);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrFloat", [], new TraitReference("ToStr", [], floatType))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("ToStr/int", new TraitReference("ToStr", [], intType), 0),
        new Obligation("ToStr/float", new TraitReference("ToStr", [], floatType), 0),
        new Obligation("ToStr/str", new TraitReference("ToStr", [], fooType), 0)
      ]);

    var expectedResult =
      {
        "confirmed": ["ToStr/int -> ToStrInt<>",
                      "ToStr/float -> ToStrFloat<>"],
        "deferred": [],
        "overflow": [],
        "noImpl": ["ToStr/str"]
      };

    assertEq(JSON.stringify(expectedResult), result.toString());
  });
})();

(function genericImpl() {
  // test an `impl<T:ToStr> ToStr for List<T>` and check that it
  // can match `List<int>` but not `List<foo>` (because ToStr not
  // implemented for foo)
  expectSuccess(function() {
    var intType = new Type("int", []);
    var fooType = new Type("foo", []);
    var listType = t => new Type("list", [t]);
    var p0Type = new TypeParameter(0);
    var p0Def = new TypeParameterDef(0, [new TraitReference("ToStr", [], p0Type)]);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrList", [p0Def], new TraitReference("ToStr", [], listType(p0Type)))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("ToStr(List<int>)", new TraitReference("ToStr", [], listType(intType)), 0),
        new Obligation("ToStr(List<foo>)", new TraitReference("ToStr", [], listType(fooType)), 0)
      ]);

    var expectedResult = {
      "confirmed": ["ToStr(List<int>) -> ToStrList<${0:int}>",
                    "ToStr(List<foo>) -> ToStrList<${1:foo}>",
                    "ToStr(List<int>).0 -> ToStrInt<>"],
      "deferred": [],
      "overflow": [],
      "noImpl": ["ToStr(List<foo>).0"]
    };

    assertEq(JSON.stringify(expectedResult), result.toString());
  })
})();

(function openEndedImpl() {
  // test an `impl<T:Foo> ToStr for List<T>` and check that it
  // can match `List<V0>` is considered deferred even if there are no
  // impls of Foo, since in another crate we might define a type
  // and implement Foo for it.
  expectSuccess(function() {
    var env = new Environment();

    var listType = t => new Type("list", [t]);
    var v0Type = env.freshVariable();

    var TType = new TypeParameter(0);
    var TDef = new TypeParameterDef(0, [new TraitReference("Foo", [], TType)]);

    var program = new Program(
      [],
      [
        new Impl("ToStr", [TDef], new TraitReference("ToStr", [], listType(TType)))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("ToStr(List<V0>)", new TraitReference("ToStr", [], listType(v0Type)), 0)
      ]);

    var expectedResult =  {
      "confirmed": ["ToStr(List<V0>) -> ToStr<${1:${0}}>"],
      "deferred": ["ToStr(List<V0>).0"],
      "overflow": [],
      "noImpl": []
    };

    assertEq(JSON.stringify(expectedResult), result.toString());
  })
})();

(function duplicateImpl() {
  // In this test, there are two identical impls, so we get an
  // ambiguous result.
  expectSuccess(function() {
    var intType = new Type("int", []);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("ToStr", [], intType), 0)
      ]);

    var expectedResult = {
      confirmed: [],
      deferred: ["A"],
      overflow: [],
      noImpl: []
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

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrFloat", [], new TraitReference("ToStr", [], floatType))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("ToStr", [], varType), 0)
      ]);

    var expectedResult = {
      confirmed: [],
      deferred: ["A"],
      overflow: [],
      noImpl: []
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

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("ToStr", [], varType), 0)
      ]);

    var expectedResult = {
      confirmed: [{impl: "ToStrInt", obligation: "A"}],
      deferred: [],
      overflow: [],
      noImpl: []
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

    var program = new Program(
      [],
      [
        new Impl("IterableList", [p0Def], new TraitReference("Iterable", [p0Type], listType(p0Type))),
        new Impl("IterableArray", [p0Def], new TraitReference("Iterable", [p0Type], arrayType(p0Type)))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("Iterable", [varType], listType(intType)), 0)
      ]);

    var expectedResult = {
      confirmed: [{impl: "IterableList", obligation: "A"}],
      deferred: [],
      overflow: [],
      noImpl: []
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

    var program = new Program(
      [],
      [
        new Impl("IterableChar", [], new TraitReference("Iterable", [charType], strType)),
        new Impl("IterableByte", [], new TraitReference("Iterable", [u8Type], strType)),
      ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("Iterable", [varType], strType), 0)
      ]);

    var expectedResult = {
      confirmed: [],
      deferred: ["A"],
      overflow: [],
      noImpl: []
    };

    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
    assertEq(varType.isBound(), false);
  })
})();

(function infiniteLoop1() {
  // A very simple infinite loop:
  //
  // impl<T:ToStr> ToStr for T
  expectSuccess(function() {
    var env = new Environment();

    var strType = new Type("str", []);

    var p0Type = new TypeParameter(0);
    var p0Def = new TypeParameterDef(0, [new TraitReference("ToStr", [], p0Type)]);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStr", [p0Def], new TraitReference("ToStr", [], p0Type))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("ToStr", [], strType), 0)
      ]);

    var expectedResult = {
      confirmed: [{impl:"ToStr",
                   obligation:"A"},
                  {impl:"ToStr",
                   obligation:"A.0"},
                  {impl:"ToStr",
                   obligation:"A.0.0"},
                  {impl:"ToStr",
                   obligation:"A.0.0.0"},
                  {impl:"ToStr",
                   obligation:"A.0.0.0.0"}],
      deferred: [],
      overflow: [{obligation:"A.0.0.0.0.0"}],
      noImpl: [],
    };

    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
  })
})();

(function infiniteLoop2() {
  // A more complex infinite loop:
  //
  // impl<T:Y> X for T
  // impl<U:X> Y for U
  expectSuccess(function() {
    var env = new Environment();

    var strType = new Type("str", []);

    var pTType = new TypeParameter(0);
    var pTDef = new TypeParameterDef(0, [new TraitReference("Y", [], pTType)]);

    var pUType = new TypeParameter(0);
    var pUDef = new TypeParameterDef(0, [new TraitReference("X", [], pUType)]);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStr", [pTDef], new TraitReference("X", [], pTType)),
        new Impl("ToStr", [pUDef], new TraitReference("Y", [], pUType))
      ]);

    var result =
      resolve(program, env, [
        new Obligation("A", new TraitReference("X", [], strType), 0)
      ]);

    var expectedResult = {
      confirmed: [{impl:"ToStr",
                   obligation:"A"},
                  {impl:"ToStr",
                   obligation:"A.0"},
                  {impl:"ToStr",
                   obligation:"A.0.0"},
                  {impl:"ToStr",
                   obligation:"A.0.0.0"},
                  {impl:"ToStr",
                   obligation:"A.0.0.0.0"}],
      deferred: [],
      overflow: [{obligation:"A.0.0.0.0.0"}],
      noImpl: [],
    };

    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
  })
})();

printSummary();
