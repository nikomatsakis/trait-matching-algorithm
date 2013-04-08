load("testLib.js");
load("type.js");
load("trait.js");

(function basicSuccess() {
  expectSuccess(function() {
    var intType = new Type("int", []);
    var floatType = new Type("float", []);
    var stringType = new Type("string", []);

    var env = new Environment();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      new Impl("ToStrFloat", [], new TraitReference("ToStr", [], floatType))
    ]);

    var result =
      resolve(program, env, [
        new Obligation("ToStr/int", new TraitReference("ToStr", [], intType)),
        new Obligation("ToStr/float", new TraitReference("ToStr", [], floatType)),
        new Obligation("ToStr/str", new TraitReference("ToStr", [], stringType))
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
                "id": "string",
                "typeParameters": []
              },
              "typeParameters": []
            }
          }
        ]
      };

    DEBUG(JSON.stringify(result, undefined, 2));
    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
  });
})();

(function genericImpl() {
  expectSuccess(function() {
    var intType = new Type("int", []);
    var stringType = new Type("string", []);
    var listType = t => new Type("list", [t]);
    var p0Type = new TypeParameter(0);

    var env = new Environment();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      new Impl("ToStrList", [new TypeParameterDef([new TraitReference("ToStr", [], p0Type)])], new TraitReference("ToStr", [], listType(p0Type)))
    ]);

    var result =
      resolve(program, env, [
        new Obligation("ToStr(List<int>)", new TraitReference("ToStr", [], listType(intType))),
        new Obligation("ToStr(List<string>)", new TraitReference("ToStr", [], listType(stringType)))
      ]);

    var expectedResult = {
      "confirmed": [
        {
          "impl": "ToStrList",
          "obligation": "ToStr(List<int>)"
        },
        {
          "impl": "ToStrList",
          "obligation": "ToStr(List<string>)"
        },
        {
          "impl": "ToStrInt",
          "obligation": "ToStr(List<int>).0"
        }
      ],
      "deferred": [],
      "errors": [
        {
          "obligation": "ToStr(List<string>).0",
          "traitReference": {
            "id": "ToStr",
            "selfType": {
              "index": 1,
              "value": {
                "id": "string",
                "typeParameters": []
              }
            },
            "typeParameters": []
          }
        }
      ]
    };

    assertEq(JSON.stringify(result, undefined, 2),
             JSON.stringify(expectedResult, undefined, 2));
  })
})();

printSummary();
