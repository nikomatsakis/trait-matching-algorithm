#!/bin/bash

JSENGINE="$1"

if [ "$JSENGINE" == "" ]; then
    echo "Usage: runTests.sh <path-to-spidermoney>"
    exit 1
fi

for TESTFILE in *Test.js; do
    echo "__________________________________________________"
    echo "Running $TESTFILE:"
    "$JSENGINE" -f testLib.js -f type.js -f typeTest.js
done
