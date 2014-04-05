# trait-matching-algorithm

## Structure

A prototype of a proposed Rust trait matching algorithm. The prototype
is intended to be run with the spidermonkey shell and is divided into
several "modules" (sadly not proper ES6 modules):

- **type:** some classes to represent types and a very simple
  unification algorithm.
- **trait:** the core trait resolution algorithm.
- **coherence:** the coherence test that ensures that we cannot have
  overlapping impls.
- **method:** the method resolution algorithm for calls like `a.b()`.

## The basic idea

## Shortcomings

- I don't currently model inherent methods.
- I don't currently model the orphan check.


