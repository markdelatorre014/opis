import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Info, 
  ChevronRight, 
  Database, 
  Settings, 
  CheckCircle2, 
  Loader2,
  FileBarChart2,
  X,
  AlertCircle,
  CheckCircle,
  Network,
  Zap,
  Replace,
  Sparkles,
  ShieldAlert,
  Wand2
} from 'lucide-react';

const apiKey = "";

// Helper for Gemini API calls with exponential backoff
async function callGemini(userQuery, systemPrompt = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
    } catch (error) {
      if (i === 4) throw error;
      await new Promise(res => setTimeout(res, Math.pow(2, i) * 1000));
    }
  }
}

const BASELINE_TEXT = `M3_AdvanceShipNotice_Load_In
Property 
Value 
m3beWarehouseInterfaceProcessFlag
*EXE

M3_AdvanceShipNotice_Process_In
Property 
Value 
m3beAddressNumber
PICKUP
m3beWarehouseInterfaceProcessFlag
*EXE

M3_AdvanceShipNotice_Process_Out
Property 
Value 
m3beHoldCode
QCPUT
m3beHoldCodeStopPutaway
QMS
m3beToLocation
QMSTRANSIT
m3beToLocationStopPutaway
QC

M3_AdvanceShipNotice_Sync_In
Property 
Value 
m3beWarehouseInterfaceProcessFlag
*EXE

M3_AdvanceShipNotice_Sync_Out
Property 
Value 
m3beDocumentIDSeparator
space

M3_BillOfMaterials_Process_In
Property 
Value 
m3beSubstitutionType
2
m3beUsedInStandard
true

M3_BillOfMaterials_Process_Out
Property 
Value 
m3beDisplaySequenceNumber
true

M3_BillOfMaterials_Sync_In
Property 
Value 
m3beAddProductsNotInItemMaster
false
m3beCopyOperation
true
m3beIgnoreOperation
true
m3beIgnoreWarning
false
m3beSequenceNumberInterval
10
m3beSetStatusToPreliminary
false
m3beSetYieldComponent
false
m3beUsedInStandard
true

M3_CarrierRoute_Process_In
Property 
Value 
m3beProcessFlag
*EXE

M3_CodeDefinitionCapabilities_Sync_In
Property 
Value 
m3beCapabilityType
C01

M3_CodeDefinitionRoles_Sync_In
Property 
Value 
m3beCapabilityType
C01

M3_InventoryHold_Process_Out
Property 
Value 
m3beInspectHoldCode
QCPUT
m3beInspectHoldCodeStopPutaway
QMS
m3beRejectHoldCode
DAMAGE

M3_SecurityUserMaster_Sync_In
Property 
Value 
accountingEntity
780_AAA
m3UserDateFormat
YMD
m3UserDecimalFormat
,
m3UserType
MING.LE
manageM3RolesPerUserFromIFS
1
useMingleLanguage
0`;

const parseAgreementText = (text) => {
  const sections = text.split(/\n\s*\n/);
  const data = {};
  sections.forEach(section => {
    const lines = section.trim().split('\n').map(l => l.trim());
    if (lines.length < 4) return;
    const agreementName = lines[0];
    const properties = {};
    for (let i = 3; i < lines.length; i += 2) {
      if (lines[i] && lines[i+1]) {
        properties[lines[i]] = lines[i+1];
      }
    }
    data[agreementName] = properties;
  });
  return data;
};

const App = () => {
  const [activeTab, setActiveTab] = useState('process');
  const [files, setFiles] = useState({ 
    dataFlow: null, 
    agreement: null,
    bod: null,
    event: null,
    translation: null 
  });
  const [loading, setLoading] = useState({ 
    dataFlow: false, 
    agreement: false, 
    bod: false,
    event: false,
    translation: false,
    consolidated: false,
    aiAnalysis: false
  });
  const [report, setReport] = useState(null);
  const [aiMitigation, setAiMitigation] = useState(null);
  const [aiError, setAiError] = useState(null);

  const refs = {
    dataFlow: useRef(null),
    agreement: useRef(null),
    bod: useRef(null),
    event: useRef(null),
    translation: useRef(null)
  };

  const tabs = [
    { id: 'wms', label: 'M3-WMS Integration' },
    { id: 'process', label: 'M3-PLM for Process Integration' },
    { id: 'fashion', label: 'M3-PLM for Fashion Integration' },
  ];

  const handleFileChange = (key, e) => {
    if (e.target.files[0]) {
      setFiles(prev => ({ ...prev, [key]: e.target.files[0].name }));
    }
  };

  // ✨ AI FEATURE: Generate Mitigation Plan via Gemini
  const generateAiMitigationPlan = async (mismatches) => {
    setLoading(prev => ({ ...prev, aiAnalysis: true }));
    setAiError(null);
    try {
      const prompt = `Given the following configuration mismatches in an Infor M3 ERP integration:
      ${mismatches.map(m => `- ${m.field}: Baseline="${m.source}", Target="${m.target}"`).join('\n')}

      Provide a concise 3-step technical mitigation plan and an executive risk summary (max 300 words). 
      Format with clear headings. Focus on data integrity and business process continuity.`;

      const response = await callGemini(prompt, "You are an expert Infor M3 Integration Consultant specializing in technical risk mitigation.");
      setAiMitigation(response);
    } catch (err) {
      setAiError("Failed to connect to AI engine. Please check your connection.");
    } finally {
      setLoading(prev => ({ ...prev, aiAnalysis: false }));
    }
  };

  // ✨ AI FEATURE: Analyze individual mismatch via Gemini
  const analyzeMismatchWithAi = async (idx) => {
    if (!report) return;
    const item = report.details[idx];

    // Update loading state for this specific row locally if we wanted, 
    // but for simplicity we'll just run it as a focused action
    const prompt = `Analyze this configuration mismatch for an Infor M3 Integration:
    Property: ${item.field}
    Baseline (Standard): ${item.source}
    Customer Target (Current): ${item.target}

    In 2 sentences, explain the technical risk and one specific action the admin should take.`;

    const newDetails = [...report.details];
    newDetails[idx].analysis = "✨ Analyzing with AI...";
    setReport({ ...report, details: newDetails });

    try {
      const result = await callGemini(prompt, "You are a technical M3 consultant. Be concise and technical.");
      newDetails[idx].analysis = `✨ AI Analysis: ${result}`;
      setReport({ ...report, details: newDetails });
    } catch (err) {
      newDetails[idx].analysis = "Error: AI analysis unavailable.";
      setReport({ ...report, details: newDetails });
    }
  };

  const generateRealComparison = () => {
    const baseline = parseAgreementText(BASELINE_TEXT);
    const customerData = {
      ...baseline,
      "M3_AdvanceShipNotice_Process_Out": {
        ...baseline["M3_AdvanceShipNotice_Process_Out"],
        "m3beHoldCode": "PENDING",
        "m3beToLocation": "QMSTRANSIT"
      },
      "M3_BillOfMaterials_Sync_In": {
        ...baseline["M3_BillOfMaterials_Sync_In"],
        "m3beSequenceNumberInterval": "5",
        "m3beUsedInStandard": "false"
      },
      "M3_SecurityUserMaster_Sync_In": {
        ...baseline["M3_SecurityUserMaster_Sync_In"],
        "accountingEntity": "999_TEST"
      }
    };
    const comparisonDetails = [];
    let matchesCount = 0;
    let mismatchesCount = 0;

    Object.keys(baseline).forEach(agreement => {
      const baseProps = baseline[agreement];
      const targetProps = customerData[agreement];
      Object.keys(baseProps).forEach(prop => {
        const sourceVal = baseProps[prop];
        const targetVal = targetProps ? targetProps[prop] : "NOT_FOUND";
        const status = sourceVal === targetVal ? 'match' : 'mismatch';
        if (status === 'match') matchesCount++;
        else mismatchesCount++;

        comparisonDetails.push({
          field: `${agreement} > ${prop}`,
          source: sourceVal,
          target: targetVal,
          status: status,
          analysis: status === 'match' 
            ? "Configuration matches M3 Standard baseline." 
            : "Mismatch detected. Click Sparkle ✨ to analyze risk."
        });
      });
    });

    return {
      title: "Agreement Control Property Verification",
      timestamp: new Date().toLocaleString(),
      summary: { total: matchesCount + mismatchesCount, matches: matchesCount, mismatches: mismatchesCount },
      details: comparisonDetails
    };
  };

  const simulateAction = (key) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setLoading(prev => ({ ...prev, [key]: false }));
      if (key === 'agreement') {
        setReport(generateRealComparison());
      } else {
        setReport({
          title: "Standard Verification Report",
          timestamp: new Date().toLocaleString(),
          summary: { total: 2, matches: 1, mismatches: 1 },
          details: [
            { field: "Data Flow Mapping", source: "v2.1", target: "v2.1", status: "match", analysis: "Mapping verified." },
            { field: "Schema Validation", source: "UTF-8", target: "ASCII", status: "mismatch", analysis: "Potential character encoding issues." }
          ]
        });
      }
    }, 1200);
  };

  const ConfigSection = ({ id, title, icon: Icon, colorClass, infoText }) => (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClass}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              {title}
              <div className="group relative">
                <Info className="w-4 h-4 text-slate-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {infoText}
                </div>
              </div>
            </h3>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className={`flex-1 flex items-center h-11 px-4 rounded-lg border transition-all ${files[id] ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
          {files[id] ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium overflow-hidden">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{files[id]}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">Select {title.toLowerCase()} file...</span>
          )}
        </div>
        <input type="file" ref={refs[id]} className="hidden" onChange={(e) => handleFileChange(id, e)} />
        <button onClick={() => refs[id].current.click()} className="h-11 px-5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 flex items-center gap-2 transition-colors shadow-sm">
          <Upload className="w-4 h-4" />
          Attach
        </button>
        <button disabled={!files[id] || loading[id]} onClick={() => simulateAction(id)} className="h-11 px-5 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-all shadow-sm">
          {loading[id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart2 className="w-4 h-4" />}
          Generate Report
        </button>
      </div>
    </section>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-6 h-6 text-cyan-700" />
            Config Verify
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-between group ${activeTab === tab.id ? 'bg-cyan-50 text-cyan-800 shadow-sm border border-cyan-100' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <span>{tab.label}</span>
              <ChevronRight className={`w-4 h-4 transition-transform ${activeTab === tab.id ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`} />
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
             <div className="flex items-center gap-2 text-cyan-700 mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">AI Powered</span>
             </div>
             <p className="text-[10px] text-slate-500 leading-relaxed">Verification results are analyzed by ✨ Gemini 2.5 Flash for proactive risk mitigation.</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <span>Integrations</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-slate-900 font-medium">{tabs.find(t => t.id === activeTab)?.label}</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Integration Configuration</h2>
            <p className="text-slate-500 mt-1">Verify against Infor M3 Baseline protocols.</p>
          </header>

          <div className="space-y-6 pb-24">
            <ConfigSection id="agreement" title="Agreement Control Property" icon={Settings} colorClass="bg-purple-50 text-purple-600" infoText="Automatic comparison against baseline M3 agreement properties." />
            <ConfigSection id="dataFlow" title="Data Flow" icon={FileText} colorClass="bg-blue-50 text-blue-600" infoText="Structure validation for data stream mappings." />
            <ConfigSection id="bod" title="BOD Mapping" icon={Network} colorClass="bg-orange-50 text-orange-600" infoText="Business Object Document verification." />

            <div className="pt-8 flex justify-end">
              <button onClick={() => simulateAction('consolidated')} className="h-14 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-200 flex items-center gap-3 transition-all hover:-translate-y-0.5">
                {loading.consolidated ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                Generate Consolidated Comparison Report
              </button>
            </div>
          </div>
        </div>

        {report && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-[95vw] lg:max-w-7xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-30 rounded-t-2xl">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{report.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-slate-500 italic">Baseline Check: M3 Cloud Edition Standard</p>
                    <span className="text-slate-200 text-xs">|</span>
                    <p className="text-xs text-slate-400">{report.timestamp}</p>
                  </div>
                </div>
                <button onClick={() => {setReport(null); setAiMitigation(null);}} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 border-b border-slate-100">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Fields</p>
                    <p className="text-2xl font-bold text-slate-800">{report.summary.total}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center border-l-4 border-l-emerald-500">
                    <p className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">Matches</p>
                    <p className="text-2xl font-bold text-emerald-600">{report.summary.matches}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center border-l-4 border-l-rose-500">
                    <p className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Mismatches</p>
                    <p className="text-2xl font-bold text-rose-600">{report.summary.mismatches}</p>
                  </div>
                  <button 
                    disabled={loading.aiAnalysis}
                    onClick={() => generateAiMitigationPlan(report.details.filter(d => d.status === 'mismatch'))}
                    className="flex flex-col items-center justify-center gap-1 bg-cyan-700 text-white p-4 rounded-xl shadow-lg shadow-cyan-100 hover:bg-cyan-800 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                  >
                    {loading.aiAnalysis ? <Loader2 className="w-6 h-6 animate-spin" /> : <ShieldAlert className="w-6 h-6" />}
                    <span className="text-[11px] font-bold uppercase tracking-tighter">✨ Generate AI Mitigation</span>
                  </button>
                </div>

                {aiMitigation && (
                  <div className="m-6 p-6 bg-cyan-50 border border-cyan-200 rounded-2xl relative animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-3 mb-4 text-cyan-800">
                       <div className="p-2 bg-white rounded-lg shadow-sm">
                          <Wand2 className="w-5 h-5" />
                       </div>
                       <h4 className="font-bold text-lg">✨ AI Migration & Risk Strategy</h4>
                    </div>
                    <div className="prose prose-sm max-w-none text-cyan-900 whitespace-pre-wrap leading-relaxed bg-white/50 p-4 rounded-xl border border-cyan-100">
                       {aiMitigation}
                    </div>
                    <button onClick={() => setAiMitigation(null)} className="absolute top-4 right-4 text-cyan-400 hover:text-cyan-600">
                       <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <div className="p-6">
                  <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                      <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="pb-4 px-3 border-b border-slate-100 w-1/4">Agreement Path</th>
                        <th className="pb-4 px-3 border-b border-slate-100 w-1/6">Baseline</th>
                        <th className="pb-4 px-3 border-b border-slate-100 w-1/6">Target System</th>
                        <th className="pb-4 px-3 border-b border-slate-100 text-center w-24">Status</th>
                        <th className="pb-4 px-3 border-b border-slate-100">Automated Risk Analysis</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {report.details.map((item, idx) => (
                        <tr key={idx} className={`group hover:bg-slate-50 transition-colors ${item.status === 'mismatch' ? 'bg-rose-50/10' : ''}`}>
                          <td className="py-4 px-3 border-b border-slate-50 font-medium text-slate-700 align-top">{item.field}</td>
                          <td className="py-4 px-3 border-b border-slate-50 text-slate-500 font-mono text-[11px] align-top">{item.source}</td>
                          <td className={`py-4 px-3 border-b border-slate-50 font-mono text-[11px] align-top ${item.status === 'mismatch' ? 'text-rose-600 font-bold underline decoration-rose-200 underline-offset-4' : 'text-slate-500'}`}>
                            {item.target}
                          </td>
                          <td className="py-4 px-3 border-b border-slate-50 text-center align-top">
                            {item.status === 'match' ? (
                              <div className="flex flex-col items-center">
                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                <span className="text-[8px] font-bold text-emerald-600 mt-1 uppercase">Valid</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <AlertCircle className="w-5 h-5 text-rose-500" />
                                <span className="text-[8px] font-bold text-rose-600 mt-1 uppercase">Delta</span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-3 border-b border-slate-50 align-top">
                            <div className="flex items-start gap-3">
                              <div className={`flex-1 p-3 rounded-xl text-xs leading-relaxed transition-all ${item.status === 'match' ? 'bg-slate-50 text-slate-400' : 'bg-white border border-rose-100 text-rose-800 shadow-sm'}`}>
                                {item.analysis}
                              </div>
                              {item.status === 'mismatch' && !item.analysis.startsWith('✨ AI Analysis') && (
                                <button 
                                  onClick={() => analyzeMismatchWithAi(idx)}
                                  className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all hover:scale-110 active:scale-90 flex-shrink-0"
                                  title="Analyze with AI"
                                >
                                  <Sparkles className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center rounded-b-2xl">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                   <Info className="w-4 h-4" />
                   Verification reports should be validated by a certified Infor Consultant.
                </div>
                <div className="flex gap-3">
                  <button onClick={() => {setReport(null); setAiMitigation(null);}} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                    Close
                  </button>
                  <button className="px-5 py-2.5 bg-cyan-700 text-white text-sm font-semibold rounded-lg hover:bg-cyan-800 shadow-lg shadow-cyan-100 transition-all flex items-center gap-2">
                    <FileBarChart2 className="w-4 h-4" />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;