// copied from http://codemirror.net/addon/lint/json-lint.js
// and https://github.com/zaach/jsonlint/blob/master/lib/jsonlint.js
// *because all those globals are just too painful)

const jsonlint = require('./jsonlint')

module.exports = function(CodeMirror) {
  CodeMirror.registerHelper("lint", "json", function(text) {
    var found = [];
    if (text.length === 0) return found
    jsonlint.parser.parseError = function(str, hash) {
      var loc = hash.loc;
      found.push({from: CodeMirror.Pos(loc.first_line - 1, loc.first_column),
        to: CodeMirror.Pos(loc.last_line - 1, loc.last_column),
        message: str});
    };
    try { jsonlint.parse(text); }
    catch(e) {}
    return found;
  });
}
