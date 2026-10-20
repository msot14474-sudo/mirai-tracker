import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const req=createRequire(process.env.ARTIFACT_NODE_MODULES
  ? `${process.env.ARTIFACT_NODE_MODULES}/../package.json` : import.meta.url);
const {Workbook,SpreadsheetFile}=await import(pathToFileURL(req.resolve('@oai/artifact-tool')).href);
const root=new URL('../',import.meta.url);
const data=JSON.parse(await fs.readFile(new URL('docs/evidence/2026-10-20/calculation-reconciliation.json',root),'utf8'));
const wb=Workbook.create(),sheet=wb.worksheets.add('Verification');
sheet.showGridLines=false;
sheet.getRange('B2').values=[['Calculation verification']];
sheet.getRange('B3').values=[['20 October 2026 · future capacity through 11 December 2026']];
sheet.getRange('B5:E5').values=[['Metric','Data Structures','Web Development','Database Systems']];
const labels={7:'Scope minutes',8:'Covered minutes',9:'Available minutes',11:'Calculated scope (h)',12:'Calculated covered (h)',13:'Calculated coverage',14:'Calculated remaining (h)',15:'Calculated available (h)',16:'Calculated buffer ratio',18:'API scope (h)',19:'API covered (h)',20:'API coverage',21:'API remaining (h)',22:'API available (h)',23:'API buffer ratio',25:'Maximum difference at 2 decimals',26:'Reconciliation',29:'ON TRACK threshold',30:'TIGHT threshold',32:'Calculated status',33:'API status'};
for(const [r,label]of Object.entries(labels))sheet.getRange(`B${r}`).values=[[label]];
for(const [i,row]of data.rows.entries()){
 const c=['C','D','E'][i];
 sheet.getRange(`${c}7:${c}9`).values=[[row.scopeMinutes],[row.coveredMinutes],[row.availableMinutes]];
 const formulas={11:`=${c}7/60`,12:`=${c}8/60`,13:`=${c}8/${c}7`,14:`=(${c}7-${c}8)/60`,15:`=${c}9/60`,16:`=${c}15/${c}14`,
  25:`=MAX(ABS(ROUND(${c}11,2)-${c}18),ABS(ROUND(${c}12,2)-${c}19),ABS(ROUND(${c}13*100,2)-${c}20*100),ABS(ROUND(${c}14,2)-${c}21),ABS(ROUND(${c}15,2)-${c}22),ABS(ROUND(${c}16,2)-${c}23))`,
  26:`=IF(${c}25<0.005,"MATCH","REVIEW")`,
  32:`=IF(${c}16>=${c}29,"ON TRACK",IF(${c}16>=${c}30,"TIGHT","DANGER"))`};
 for(const [r,formula]of Object.entries(formulas))sheet.getRange(`${c}${r}`).formulas=[[formula]];
 const a=row.actual;
 sheet.getRange(`${c}18:${c}23`).values=[[a.hoursInScope],[a.coveredHours],[a.coveragePercentage/100],[a.remainingHours],[a.availableHours],[a.bufferRatio]];
 sheet.getRange(`${c}29:${c}30`).values=[[1.15],[1]];
 sheet.getRange(`${c}33`).values=[[row.status.replace('_',' ')]];
}
sheet.getRange('B36').values=[['Inputs: independent sums from saved demo topics and future sessions.']];
sheet.getRange('B37').values=[['API values: authenticated dashboard response; 18 numeric comparisons.']];
sheet.getRange('B38').values=[['Source: docs/evidence/2026-10-20/calculation-reconciliation.json']];
sheet.getRange('B2:E38').format.font={name:'Arial',size:10,color:'#223552'};
sheet.getRange('B2').format.font={name:'Arial',size:16,bold:true,color:'#17386B'};
sheet.getRange('B3').format.font={name:'Arial',size:10,color:'#63748C'};
sheet.getRange('B5:E5').format={fill:'#17386B',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:30};
sheet.getRange('B5:E5').format.horizontalAlignment='center';
sheet.getRange('B6:E33').format.rowHeight=24;
sheet.getRange('B2:B38').format.columnWidth=39;
sheet.getRange('C2:E38').format.columnWidth=23;
sheet.getRange('C7:E25').setNumberFormat('0.00');
sheet.getRange('C13:E13').setNumberFormat('0.00%');
sheet.getRange('C20:E20').setNumberFormat('0.00%');
sheet.getRange('C7:E9').format.fill='#EDF3FC';
sheet.getRange('C18:E23').format.fill='#EDF3FC';
sheet.getRange('C29:E30').setNumberFormat('0.00');
sheet.getRange('B25:E26').format.font.bold=true;
sheet.getRange('C25:E25').conditionalFormats.add('cellIs',{operator:'greaterThanOrEqual',formula:0.005,format:{fill:'#FFE6DF'}});
sheet.getRange('B36:E38').format.font={name:'Arial',size:9,color:'#63748C'};
wb.recalculate();
const inspected=await wb.inspect({kind:'table',range:'Verification!B25:E26',include:'values,formulas',tableMaxRows:2,tableMaxCols:4});
console.log(inspected.ndjson);
const check=sheet.getRange('C26:E26').values[0];
if(check.some(x=>x!=='MATCH'))throw new Error('Workbook reconciliation failed.');
const preview=await wb.render({sheetName:'Verification',range:'B2:E38',scale:1.5,format:'png'});
await fs.writeFile(new URL('outputs/submission-20261020/calculation-preview.png',root),new Uint8Array(await preview.arrayBuffer()));
const file=await SpreadsheetFile.exportXlsx(wb);
await file.save(new URL('docs/submission/Calculation_Verification.xlsx',root).pathname);
console.log('Workbook exported with 18 verified comparisons.');
