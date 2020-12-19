# gcov-parse
Parse GCOV .gcda and .gcno files

<p align="center">
<a href="https://npmjs.com/package/gcov-parse" title="View project on NPM"><img src="https://img.shields.io/npm/v/gcov-parse.svg" alt="Downloads" /></a>  
<img src="https://github.com/OlegKunitsyn/gcov-parse/workflows/ci/badge.svg" />
</p>

## Installation
```
$ npm i gcov-parse
```

## Usage
```
import * as gcov from "gcov-parse";
const coverages = gcov.parse("hello");
```
