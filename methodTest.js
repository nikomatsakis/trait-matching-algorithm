load("testLib.js");
load("type.js");
load("trait.js");
load("method.js");

function setup() {
  // int
  var int = new Type("int", []);

  // struct Heap<T>
  var Heap = t => new Type("Heap", [t]);

  // struct Gc<T>
  var Gc = t => new Type("Gc", [t]);

  // Useful type parameter: <A>
  var A = new TypeParameter(0);
  var ADef = new TypeParameterDef(0, []);

  // impl<A> Deref<A> for Ref<A>
  var ImplDerefForRef = new Impl(
    "DerefForRef", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], Ref(A)));

  // impl<A> Deref<A> for RefMut<A>
  var ImplDerefForRefMut = new Impl(
    "DerefForRefMut", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], RefMut(A)));

  // impl<A> Deref<A> for Heap<A>
  var ImplDerefForHeap = new Impl(
    "DerefForHeap", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], Heap(A)));

  // impl<A> Deref<A> for Gc<A>
  var ImplDerefForGc = new Impl(
    "DerefGc", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], Gc(A)));

  // impl<A> DerefMut<A> for Heap<A>
  var ImplDerefMutForHeap = new Impl(
    "DerefMutForHeap", [ADef],
    new TraitReference(DEREF_MUT_TRAIT.id, [A], Heap(A)));

  // impl<A> DerefMut<A> for RefMut<A>
  var ImplDerefMutForRefMut = new Impl(
    "DerefMutForRefMut", [ADef],
    new TraitReference(DEREF_MUT_TRAIT.id, [A], RefMut(A)));

  // trait Test {
  //   fn val(Self);
  //   fn ref(&Self);
  //   fn heap(Heap<Self>);
  //   fn gc(Gc<Self>);
  // }
  var TestTrait = new Trait("Test", [], [
    new Method("val", TypeParameterSelf),
    new Method("ref", Ref(TypeParameterSelf)),
    new Method("ref_mut", RefMut(TypeParameterSelf)),
    new Method("heap", Heap(TypeParameterSelf)),
    new Method("gc", Gc(TypeParameterSelf)),
  ]);

  // impl Test for int
  var ImplTestForInt = new Impl(
    "TestForInt", [],
    new TraitReference("Test", [], int));

  var env = new Environment();
  var program = new Program(
    [
      DEREF_TRAIT,
      DEREF_MUT_TRAIT,
      "Test"
    ],
    [
      ImplDerefForHeap, ImplDerefForGc,
      ImplDerefForRef, ImplDerefForRefMut,
      ImplDerefMutForHeap, ImplDerefMutForRefMut,
      ImplTestForInt
    ]);

  return {int: int,
          Gc: Gc,
          Heap: Heap,
          env: env,
          program: program,
          TestTrait: TestTrait};
}

(function byValueInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, int, [TestTrait], "val");
    assertEq(r.success, true);
    assertEq(r.adjusted.toString(), "int");
    assertEq(r.traitRef.toString(), "Test<for int>");
  });
})();

(function byValueRefInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, Ref(int), [TestTrait], "val");
    assertEq(r.success, true);
    assertEq(r.adjusted.toString(), "*Ref<int>");
    assertEq(r.traitRef.toString(), "Test<for ${0:int}>");
  });
})();

(function byRefRefInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, Ref(int), [TestTrait], "ref");
    assertEq(r.success, true);
    assertEq(r.adjusted.toString(), "&*Ref<int>");
    assertEq(r.traitRef.toString(), "Test<for ${0:int}>");
  });
})();

(function byMutRefRefInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, Ref(int), [TestTrait], "ref_mut");
    assertEq(r.toString(), "CannotRefMut(*Ref<int>)");
  });
})();

(function byMutRefInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, int, [TestTrait], "ref_mut");
    assertEq(r.toString(), "Match(&mut int, Test<for int>)");
  });
})();

(function byMutRefInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, Heap(int), [TestTrait], "ref_mut");
    assertEq(r.toString(), "Match(&mut *mut Heap<int>, Test<for ${0:int}>)");
  });
})();

(function byGcHeapInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, Heap(int), [TestTrait], "gc");
    assertEq(r.toString(), "CannotReconcileSelfType(Gc<${0:int}>, Test<for ${0:int}>)");
  });
})();

(function byGcRefGcInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Gc, Heap} = setup();
    var r = resolveMethod(program, env, Ref(Gc(int)), [TestTrait], "gc");
    assertEq(r.toString(), "Match(*Ref<Gc<int>>, Test<for ${2:int}>)");
  });
})();


(function byGcRefGcInt() {
  expectSuccess(function() {
    // A common request is to have impls like this:
    //
    //     trait Foo { }
    //     impl Foo for uint { }
    //     impl Foo for char { }
    //
    //     trait Bar { fn method(&self); }
    //     impl<A:Foo> Bar for A { fn method(&self) { } }
    //
    //     trait Baz { fn method(&self); }
    //     impl Baz for int { fn method(&self) { } }
    //     impl Baz for char { fn method(&self) { } }
    //
    //     fn main() {
    //         let x: int = 3;
    //         x.method(); // Should call Baz::method
    //         let y: uint = 3;
    //         y.method(); // Should call Bar::method
    //         let z: char = 'a';
    //         z.method(); // Should be ambiguous
    //     }
    //
    // The current method search fails on this due to the requirement
    // for backtracking.
    //
    // Currently, we get a failure for x.method() because it confirms against
    // against Bar and Baz.

    var {env, program, int, TestTrait, Gc, Heap} = setup();

    // uint
    var uint = new Type("uint", []);
    var char = new Type("char", []);

    // trait Foo { }
    var FooTrait = new Trait("Foo", [], [
    ]);

    // impl Foo for uint { }
    var ImplFooForUint = new Impl(
      "FooForUint", [],
      new TraitReference("Foo", [], uint));

    // impl Foo for char { }
    var ImplFooForChar = new Impl(
      "FooForChar", [],
      new TraitReference("Foo", [], char));

    // trait Bar {
    //   fn method(self) { }
    // }
    var BarTrait = new Trait("Bar", [], [
      new Method("method", TypeParameterSelf),
    ]);

    // impl<A:Foo> Bar for A { }
    var A = new TypeParameter(0);
    var ADef = new TypeParameterDef(0, [new TraitReference("Foo", [], A)]);
    var ImplBarForFoo = new Impl(
      "BarForFoo", [ADef], new TraitReference("Bar", [], A));

    // trait Baz {
    //   fn method(self) { }
    // }
    var BazTrait = new Trait("Baz", [], [
      new Method("method", TypeParameterSelf),
    ]);

    // impl Baz for int { }
    var ImplBazForInt = new Impl(
      "BazForInt", [], new TraitReference("Baz", [], int));

    // impl Baz for char { }
    var ImplBazForChar = new Impl(
      "BazForChar", [], new TraitReference("Baz", [], char));

    program = new Program(
      Array.concat(program.traits, [FooTrait, BarTrait, BazTrait]),
      Array.concat(program.impls, [ImplFooForUint, ImplFooForChar,
                                   ImplBarForFoo,
                                   ImplBazForInt, ImplBazForChar])
    );

    var r = resolveMethod(program, env, int,
                          [BarTrait, BazTrait], "method");
    assertEq(r.toString(), "Match(int, Baz<for int>)");

    var r = resolveMethod(program, env, uint,
                          [BarTrait, BazTrait], "method");
    assertEq(r.toString(), "Match(uint, Bar<for uint>)");

    var r = resolveMethod(program, env, char,
                          [BarTrait, BazTrait], "method");
    assertEq(r.toString(), "Ambiguous(Bar,Baz)");
  });
})();

printSummary();
