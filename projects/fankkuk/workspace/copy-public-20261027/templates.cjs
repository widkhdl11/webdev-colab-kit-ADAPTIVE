const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pairs = JSON.parse(fs.readFileSync(path.join(__dirname,'pairs.json'),'utf8'));
const files = [...new Set(pairs.flatMap(p=>p.files))];
const nodes=[];
for(const file of files){
 if(!fs.existsSync(file))continue;
 const source=fs.readFileSync(file,'utf8');
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 function visit(n){
  if(ts.isTemplateExpression(n)) nodes.push({file,source:n.getText(sf),parts:[n.head.text,...n.templateSpans.map(s=>s.literal.text)],expr:n.templateSpans.map(s=>s.expression.getText(sf))});
  ts.forEachChild(n,visit);
 }
 visit(sf);
}
fs.writeFileSync(path.join(__dirname,'templates.json'),JSON.stringify(nodes,null,2));
