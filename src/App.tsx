import React, { useState, useEffect } from 'react';
import { supabase } from './supabase'; 
import { usePlacesWidget } from "react-google-autocomplete"; 

// --- MINI COMPONENT FOR GOOGLE MAPS ---
const AddressInput = ({ formData, setFormData }: any) => {
  const { ref } = usePlacesWidget<HTMLInputElement>({
    apiKey: "YAIzaSyDJygTGB49TR4hPg3lM_V-qMrBSQQbrs80",
    options: { types: ["address"], componentRestrictions: { country: "us" } },
    onPlaceSelected: (place: any) => {
      let street = '', city = '', state = '', zip = '';
      
      place.address_components?.forEach((comp: any) => {
        const types = comp.types;
        if (types.includes('street_number')) street += comp.long_name + ' ';
        if (types.includes('route')) street += comp.long_name;
        if (types.includes('locality')) city = comp.long_name;
        if (types.includes('administrative_area_level_1')) state = comp.short_name;
        if (types.includes('postal_code')) zip = comp.long_name;
      });

      setFormData((prev: any) => ({ ...prev, street: street.trim(), city, state, zip }));
    }
  });

  return (
    <input
      ref={ref}
      name="street"
      defaultValue={formData.street}
      onChange={(e) => setFormData((prev: any) => ({...prev, street: e.target.value}))}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
      placeholder="Start typing an address..."
    />
  );
};

// --- WORKFLOW STAGES ---
const workflowStages = [
  "Lead", "Quoted", "In Queue", "Work Start", "Prepped", "Waiting on Material", 
  "Install Complete", "Invoiced", "Paid", "Delivered"
];

const TAX_RATE = 0.065; // 6.5% Florida
const LOGO_URL = "https://www.precisiongraphicsco.com/images/nav-logo.jpeg";

export default function App() {
  // --- STATE ---
  const [currentView, setCurrentView] = useState('board'); 
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [documentMode, setDocumentMode] = useState<'quote' | 'invoice' | null>(null); 
  const [fitToScreen, setFitToScreen] = useState(false);
  
  const [crmSearchTerm, setCrmSearchTerm] = useState(''); 
  const [crmSortRule, setCrmSortRule] = useState('newest'); 

  const [inventory, setInventory] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    customerName: '', phone: '', email: '', street: '', city: '', state: 'FL', zip: '',
    jobType: 'vehicle', location: 'in-house', vehicleCategory: '', vehicleYear: '', vehicleMake: '', vehicleModel: '',
    jobAddress: '', notes: '', sqFt: '', selectedMaterialId: '', hours: '', laborRate: '100'
  });

  const [newMaterial, setNewMaterial] = useState({ name: '', category: 'Vinyl', pricePerSqFt: '', stockSqFt: '' });

  // --- STARTUP CLOUD FETCH ---
  useEffect(() => {
    fetchInventory();
    fetchJobs();
  }, []);

  async function fetchInventory() {
    const { data, error } = await supabase.from('inventory').select('*');
    if (data) {
      setInventory(data);
      if (data.length > 0) setFormData(prev => ({ ...prev, selectedMaterialId: data[0].id }));
    }
    if (error) console.error("Error fetching inventory:", error);
  }

  async function fetchJobs() {
    const { data, error } = await supabase.from('jobs').select('*');
    if (data) setJobs(data);
    if (error) console.error("Error fetching jobs:", error);
  }

  // --- CRM MANAGEMENT ENGINE ---
  const updateJobStatus = async (jobId: number, newStatus: string) => {
    setJobs(prevJobs => prevJobs.map(job => job.id === jobId ? { ...job, status: newStatus } : job));
    if (selectedJob && selectedJob.id === jobId) {
      setSelectedJob((prev: any) => ({ ...prev, status: newStatus }));
    }
    await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
  };

  const handleArchiveLead = async (jobId: number) => {
    if(!confirm("Move this file out of the active workflow board and tag as a Potential CRM Lead?")) return;
    setJobs(prev => prev.map(job => job.id === jobId ? { ...job, archived: true } : job));
    setSelectedJob(null);
    await supabase.from('jobs').update({ archived: true }).eq('id', jobId);
  };

  const handleUnarchiveLead = async (jobId: number) => {
    setJobs(prev => prev.map(job => job.id === jobId ? { ...job, archived: false } : job));
    setSelectedJob(null);
    await supabase.from('jobs').update({ archived: false }).eq('id', jobId);
  };

  const handleDeleteLead = async (jobId: number) => {
    if(!confirm("CRITICAL WARNING: Are you sure you want to completely DELETE this client record? This action cannot be undone.")) return;
    setJobs(prev => prev.filter(job => job.id !== jobId));
    setSelectedJob(null);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) console.error("Error deleting lead:", error);
  };

  const handleAdvanceStatus = async () => {
    if (!selectedJob) return;
    const currentIndex = workflowStages.indexOf(selectedJob.status);
    if (currentIndex !== -1 && currentIndex < workflowStages.length - 1) {
      const nextStatus = workflowStages[currentIndex + 1];
      await updateJobStatus(selectedJob.id, nextStatus);
    }
  };

  const handleRegressStatus = async () => {
    if (!selectedJob) return;
    const currentIndex = workflowStages.indexOf(selectedJob.status);
    if (currentIndex > 0) {
      const prevStatus = workflowStages[currentIndex - 1];
      await updateJobStatus(selectedJob.id, prevStatus);
    }
  };

  const handleActionTrigger = async (actionType: 'quote_sent' | 'approved' | 'ready_for_work') => {
    if (!selectedJob) return;
    if (actionType === 'quote_sent') {
      setDocumentMode('quote');
      if (selectedJob.status === 'Lead') {
        await updateJobStatus(selectedJob.id, 'Quoted');
      }
    } else if (actionType === 'approved') {
      await updateJobStatus(selectedJob.id, 'In Queue');
    } else if (actionType === 'ready_for_work') {
      await updateJobStatus(selectedJob.id, 'Work Start');
    }
  };

  const handleSaveNotes = async (e: any) => {
    const newNotes = e.target.value;
    setSelectedJob({ ...selectedJob, notes: newNotes });
    setJobs(jobs.map(job => job.id === selectedJob.id ? { ...job, notes: newNotes } : job));
    await supabase.from('jobs').update({ notes: newNotes }).eq('id', selectedJob.id);
  };

  const handleJobAdjustment = async (field: string, value: string) => {
    const numValue = value === '' ? 0 : parseFloat(value);
    const updatedJob = { ...selectedJob, [field]: numValue };
    
    const mat = inventory.find(m => m.id === updatedJob.selectedMaterialId);
    const mRate = mat ? parseFloat(mat.pricePerSqFt) : 0;

    const mCost = (updatedJob.sqFt || 0) * mRate;
    const lCost = (updatedJob.hours || 0) * (updatedJob.laborRate || 0);
    const customAdjustment = (updatedJob.adjustment || 0);
    updatedJob.total = mCost + lCost + customAdjustment;

    setSelectedJob(updatedJob);
    setJobs(jobs.map(job => job.id === updatedJob.id ? updatedJob : job));

    await supabase.from('jobs').update({ 
      [field]: numValue,
      total: updatedJob.total 
    }).eq('id', updatedJob.id);
  };

  const handleFormChange = (e: any) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAddMaterial = async (e: any) => {
    e.preventDefault();
    const newMat = {
      id: 'mat_' + Math.floor(Math.random() * 100000),
      name: newMaterial.name, 
      category: newMaterial.category,
      pricePerSqFt: parseFloat(newMaterial.pricePerSqFt) || 0, 
      stockSqFt: parseFloat(newMaterial.stockSqFt) || 0
    };

    const { error } = await supabase.from('inventory').insert([newMat]);
    if (!error) {
      setInventory([...inventory, newMat]);
      setNewMaterial({ name: '', category: 'Vinyl', pricePerSqFt: '', stockSqFt: '' });
      alert('Material saved successfully!');
      if (!formData.selectedMaterialId) setFormData(prev => ({ ...prev, selectedMaterialId: newMat.id }));
    }
  };

  const handleSubmitJob = async (e: any) => {
    e.preventDefault();
    const selectedMat = inventory.find(m => m.id === formData.selectedMaterialId);
    const mCost = (parseFloat(formData.sqFt) || 0) * (selectedMat ? parseFloat(selectedMat.pricePerSqFt) : 0);
    const lCost = (parseFloat(formData.hours) || 0) * (parseFloat(formData.laborRate) || 0);
    
    const jobToInsert = {
      customerName: formData.customerName, phone: formData.phone, email: formData.email,
      street: formData.street, city: formData.city, state: formData.state, zip: formData.zip,
      jobType: formData.jobType, location: formData.location, vehicleCategory: formData.vehicleCategory,
      vehicleYear: formData.vehicleYear, vehicleMake: formData.vehicleMake, vehicleModel: formData.vehicleModel,
      jobAddress: formData.jobAddress, notes: formData.notes, sqFt: parseFloat(formData.sqFt) || 0,
      selectedMaterialId: formData.selectedMaterialId, hours: parseFloat(formData.hours) || 0,
      laborRate: parseFloat(formData.laborRate) || 100, adjustment: 0, status: 'Lead', total: mCost + lCost,
      archived: false
    };

    const { data, error } = await supabase.from('jobs').insert([jobToInsert]).select();
    if (!error && data) {
      setJobs([...jobs, data[0]]); 
      setFormData({
        customerName: '', phone: '', email: '', street: '', city: '', state: 'FL', zip: '',
        jobType: 'vehicle', location: 'in-house', vehicleCategory: '', vehicleYear: '', vehicleMake: '', vehicleModel: '',
        jobAddress: '', notes: '', sqFt: '', selectedMaterialId: inventory.length > 0 ? inventory[0].id : '', hours: '', laborRate: '100'
      });
      setCurrentView('board');
    }
  };

  // --- UTILS ---
  const activeJobs = jobs.filter(j => !j.archived);

  const processedCrmRecords = jobs
    .filter(job => {
      const searchString = `${job.customerName} ${job.phone} ${job.vehicleMake} ${job.vehicleModel} ${job.status}`.toLowerCase();
      return searchString.includes(crmSearchTerm.toLowerCase());
    })
    .sort((a, b) => {
      if (crmSortRule === 'newest') return b.id - a.id; 
      if (crmSortRule === 'oldest') return a.id - b.id;
      if (crmSortRule === 'value-high') return (b.total || 0) - (a.total || 0);
      if (crmSortRule === 'value-low') return (a.total || 0) - (b.total || 0);
      if (crmSortRule === 'name-az') return a.customerName.localeCompare(b.customerName);
      if (crmSortRule === 'name-za') return b.customerName.localeCompare(a.customerName);
      return 0;
    });

  const currentMaterial = inventory.find(mat => mat.id === formData.selectedMaterialId);
  const liveMaterialCost = (parseFloat(formData.sqFt) || 0) * (currentMaterial ? parseFloat(currentMaterial.pricePerSqFt) : 0);
  const liveLaborCost = (parseFloat(formData.hours) || 0) * (parseFloat(formData.laborRate) || 0);
  const liveEstimatedSubtotal = liveMaterialCost + liveLaborCost;

  const activeInvoiceMaterial = selectedJob ? inventory.find(m => m.id === selectedJob.selectedMaterialId) : null;
  const activeMaterialRate = activeInvoiceMaterial ? parseFloat(activeInvoiceMaterial.pricePerSqFt) : 0;
  const activeMaterialName = activeInvoiceMaterial ? activeInvoiceMaterial.name : 'Material Cost';

  const subtotal = selectedJob ? (selectedJob.total || 0) : 0;
  const taxAmount = subtotal * TAX_RATE;
  const grandTotal = subtotal + taxAmount;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 flex flex-col relative">
      
      {/* NAV BAR WITH OFFICIALLY BRANDED LOGO HEADER */}
      <nav className="bg-black border-b border-yellow-500/30 p-3 sticky top-0 z-40 shadow-lg print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            {/* Direct Vector Embedded Image Asset */}
            <img 
              src={LOGO_URL} 
              alt="Precision Graphics Co. Logo" 
              className="h-10 object-contain rounded border border-zinc-800"
              onError={(e) => {
                // Fail-safe text fallback rendering if host connection ever drops
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex flex-col">
              <h1 className="text-sm font-black uppercase tracking-widest italic text-white leading-none">Precision</h1>
              <span className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5 tracking-wider">Graphics Co. Operating Engine</span>
            </div>
            <span className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded-full ml-1 font-bold uppercase tracking-tight">Live Cloud</span>
          </div>
          <div className="flex gap-2 md:gap-4 flex-wrap justify-center">
            <button onClick={() => {setCurrentView('intake'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider ${currentView === 'intake' ? 'text-yellow-500 bg-zinc-900 border border-zinc-800' : 'text-zinc-400 border border-transparent'}`}>+ New Intake</button>
            <button onClick={() => {setCurrentView('board'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider ${currentView === 'board' ? 'text-yellow-500 bg-zinc-900 border border-zinc-800' : 'text-zinc-400 border border-transparent'}`}>Workflow Board</button>
            <button onClick={() => {setCurrentView('inventory'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider ${currentView === 'inventory' ? 'text-yellow-500 bg-zinc-900 border border-zinc-800' : 'text-zinc-400 border border-transparent'}`}>Inventory</button>
            <button onClick={() => {setCurrentView('crm-directory'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider relative ${currentView === 'crm-directory' ? 'text-yellow-500 bg-zinc-900 border border-zinc-800' : 'text-zinc-400 border border-transparent'}`}>
              👥 Customer CRM Directory
              {jobs.length > 0 && <span className="absolute -top-1 -right-2 bg-yellow-500 text-black font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center">{jobs.length}</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-grow p-4 md:p-6 flex flex-col">
        
        {/* VIEW BRANDED QUOTE / INVOICE MODE */}
        {documentMode && selectedJob ? (
          <div className="max-w-4xl mx-auto w-full bg-white text-zinc-900 p-8 md:p-12 shadow-2xl rounded-sm mb-20 border-t-8 border-black animate-fade-in">
            <div className="flex justify-between items-start border-b-2 border-zinc-100 pb-6 mb-6">
              <div className="flex items-center gap-4">
                <img src={LOGO_URL} alt="Precision Graphics Co." className="h-16 object-contain rounded" />
                <div>
                  <h1 className="text-2xl font-black uppercase italic tracking-tighter text-black">Precision <span className="text-yellow-600">Graphics Co.</span></h1>
                  <p className="text-xs text-zinc-500 mt-0.5 font-medium">Cape Coral, FL | (239) 445-6022</p>
                  <p className="text-xs text-yellow-600 font-semibold">www.precisiongraphicsco.com</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-wide">
                  {documentMode === 'quote' ? 'Detailed Estimate' : 'Final Invoice'}
                </h2>
                <p className="mt-1 font-mono font-bold text-sm text-zinc-700">{documentMode === 'quote' ? 'QTE' : 'INV'}-{selectedJob.id}</p>
                <p className="text-xs text-zinc-500 font-medium">Date: {new Date(selectedJob.created_at || Date.now()).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10 bg-zinc-50 p-4 rounded border border-zinc-100">
              <div>
                <h3 className="text-[10px] uppercase font-black text-zinc-400 tracking-widest mb-1">Prepared For:</h3>
                <p className="font-bold text-base text-black leading-tight">{selectedJob.customerName}</p>
                <p className="text-zinc-600 text-xs mt-1">{selectedJob.street}</p>
                <p className="text-zinc-600 text-xs">{selectedJob.city}, {selectedJob.state} {selectedJob.zip}</p>
                <p className="text-zinc-900 font-mono font-bold text-xs mt-1">{selectedJob.phone}</p>
              </div>
              <div>
                <h3 className="text-[10px] uppercase font-black text-zinc-400 tracking-widest mb-1">Project Specification:</h3>
                <p className="text-zinc-900 font-bold text-sm">{selectedJob.vehicleYear} {selectedJob.vehicleMake} {selectedJob.vehicleModel}</p>
                <p className="text-zinc-500 text-xs italic mt-0.5 uppercase tracking-wider font-bold">Type: {selectedJob.jobType} ({selectedJob.location})</p>
              </div>
            </div>

            <table className="w-full mb-10">
              <thead>
                <tr className="border-b-2 border-zinc-200 text-left text-[10px] uppercase text-zinc-400 font-black tracking-wider">
                  <th className="py-2.5">Line Item / Coverage Description</th>
                  <th className="py-2.5 text-center">Qty Parameter</th>
                  <th className="py-2.5 text-right">Unit Rate</th>
                  <th className="py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                <tr className="border-b border-zinc-100">
                  <td className="py-3.5 font-bold text-zinc-800">{activeMaterialName} Premium Film Coverage</td>
                  <td className="py-3.5 text-center font-mono">{selectedJob.sqFt} sqft</td>
                  <td className="py-3.5 text-right font-mono">${activeMaterialRate.toFixed(2)}</td>
                  <td className="py-3.5 text-right font-bold font-mono">${(selectedJob.sqFt * activeMaterialRate).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-zinc-100">
                  <td className="py-3.5 font-bold text-zinc-800">Professional Vehicle Prep, Installation & Labor</td>
                  <td className="py-3.5 text-center font-mono">{selectedJob.hours} hrs</td>
                  <td className="py-3.5 text-right font-mono">${selectedJob.laborRate?.toFixed(2)}</td>
                  <td className="py-3.5 text-right font-bold font-mono">${(selectedJob.hours * selectedJob.laborRate).toFixed(2)}</td>
                </tr>
                {selectedJob.adjustment !== 0 && (
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <td className="py-3.5 font-bold text-zinc-800 italic">Custom Adjustment / Upgrade Surcharge Bundle</td>
                    <td className="py-3.5 text-center font-mono">-</td>
                    <td className="py-3.5 text-right font-mono">-</td>
                    <td className="py-3.5 text-right font-black font-mono text-yellow-600">
                      {selectedJob.adjustment > 0 ? '+' : ''}${selectedJob.adjustment.toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 space-y-2.5 text-xs">
                <div className="flex justify-between text-zinc-500 font-medium"><span>Subtotal:</span><span className="font-mono">${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-zinc-500 font-medium"><span>Estimated FL Sales Tax (6.5%):</span><span className="font-mono">${taxAmount.toFixed(2)}</span></div>
                <div className="flex justify-between text-base font-black border-t-2 border-zinc-200 pt-2.5 text-black">
                  <span>{documentMode === 'quote' ? 'Total Estimate:' : 'Total Amount Due:'}</span>
                  <span className="text-yellow-600 font-mono">${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-12 flex gap-4 print:hidden">
              <button onClick={() => window.print()} className="bg-black text-white px-8 py-3 rounded font-bold hover:bg-zinc-900 transition tracking-wide text-xs uppercase shadow-md">🖨️ Print / Save Branded PDF</button>
              <button onClick={() => setDocumentMode(null)} className="border-2 border-zinc-200 text-zinc-500 px-6 py-3 rounded font-bold hover:bg-zinc-50 transition text-xs uppercase tracking-wide">Back to Dashboard Controls</button>
            </div>
          </div>
        ) : (
          <>
            {/* WORKFLOW BOARD */}
            {currentView === 'board' && (
               <div className="flex-grow flex flex-col h-full animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                    <div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">Active Production Bays</h2>
                      <p className="text-xs text-zinc-500">Live shop floor tracking pipeline. Select any car to view specs or print sheets.</p>
                    </div>
                    <button 
                      onClick={() => setFitToScreen(!fitToScreen)} 
                      className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:border-yellow-500/50 text-xs rounded font-bold text-zinc-300 flex items-center gap-1.5 transition"
                    >
                      {fitToScreen ? "↔️ Enable Scroll view" : "🔍 Fit All to Screen Matrix"}
                    </button>
                  </div>

                  <div className={`flex ${fitToScreen ? 'flex-wrap xl:grid xl:grid-cols-5 gap-3' : 'gap-3 overflow-x-auto pb-4'} h-full items-start`}>
                    {workflowStages.map(stage => (
                      <div 
                        key={stage} 
                        className={`${fitToScreen ? 'w-full sm:w-[19%] xl:w-auto' : 'w-56'} bg-zinc-900/40 rounded-lg border border-zinc-900 p-2.5 flex-shrink-0`}
                      >
                        <h3 className="font-black text-zinc-500 uppercase text-[10px] mb-2.5 tracking-wider flex justify-between items-center px-1">
                          <span className="truncate max-w-[80%]">{stage}</span>
                          <span className="bg-zinc-800 text-[9px] px-1.5 py-0.5 rounded text-yellow-500 font-black font-mono">
                            {activeJobs.filter(j => j.status === stage).length}
                          </span>
                        </h3>
                        <div className={`space-y-2 ${fitToScreen ? 'max-h-[35vh]' : 'max-h-[70vh]'} overflow-y-auto px-0.5`}>
                          {activeJobs.filter(j => j.status === stage).map(job => (
                            <div 
                              key={job.id} 
                              onClick={() => setSelectedJob(job)} 
                              className="bg-zinc-950 p-2.5 rounded border border-zinc-900 hover:border-yellow-500/40 transition cursor-pointer shadow-md group relative"
                            >
                              <div className="absolute top-2.5 right-2 w-1.5 h-1.5 rounded-full bg-yellow-500 opacity-0 group-hover:opacity-100 transition" />
                              <h4 className="font-extrabold text-zinc-200 text-xs truncate group-hover:text-white">{job.customerName}</h4>
                              <p className="text-[10px] text-zinc-500 truncate mt-0.5 font-medium">{job.vehicleYear} {job.vehicleMake} {job.vehicleModel}</p>
                              <div className="mt-2 flex justify-between items-center border-t border-zinc-900/60 pt-1.5">
                                <span className="text-yellow-500 font-black text-[11px] font-mono">${job.total?.toFixed(0)}</span>
                                <span className="text-[9px] text-zinc-600 group-hover:text-yellow-500 font-bold uppercase tracking-wider transition">Open file ➡️</span>
                              </div>
                            </div>
                          ))}
                          {activeJobs.filter(j => j.status === stage).length === 0 && (
                            <p className="text-zinc-800/60 text-[9px] uppercase font-bold tracking-widest text-center py-3 border border-dashed border-zinc-900/80 rounded">Clear</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
               </div>
            )}
            
            {/* INTAKE FORM */}
            {currentView === 'intake' && (
              <div className="max-w-4xl mx-auto w-full bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 overflow-hidden mb-8 animate-fade-in">
                <form onSubmit={handleSubmitJob} className="p-8 space-y-8">
                  <section>
                    <h2 className="text-xl font-semibold mb-4 border-b border-zinc-700 pb-2 text-yellow-500">1. Customer Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Customer Name</label>
                        <input type="text" name="customerName" value={formData.customerName} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Phone Number</label>
                        <input type="tel" name="phone" value={formData.phone} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Email Address</label>
                        <input type="email" name="email" value={formData.email} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Street Address</label>
                        <AddressInput formData={formData} setFormData={setFormData} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">City</label>
                        <input type="text" name="city" value={formData.city} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">State</label>
                        <input type="text" name="state" value={formData.state} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">ZIP Code</label>
                        <input type="text" name="zip" value={formData.zip} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h2 className="text-xl font-semibold mb-4 border-b border-zinc-700 pb-2 text-yellow-500">2. Job Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Job Type</label>
                        <select name="jobType" value={formData.jobType} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none">
                          <option value="vehicle">Vehicle Wrap / Tint</option>
                          <option value="building">Building / Architectural Tint</option>
                          <option value="other">Other / Custom</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Work Location</label>
                        <select name="location" value={formData.location} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none">
                          <option value="in-house">In-House (Shop)</option>
                          <option value="external">External (Mobile/On-Site)</option>
                        </select>
                      </div>

                      {formData.jobType === 'vehicle' && (
                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4 bg-zinc-950 p-4 rounded-md border border-yellow-600/30">
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">Category</label>
                            <select name="vehicleCategory" value={formData.vehicleCategory} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none">
                              <option value="" disabled>Select...</option>
                              <option value="sedan">Sedan / Coupe</option>
                              <option value="suv">SUV / Crossover</option>
                              <option value="truck">Pickup Truck</option>
                              <option value="van">Work Van / Cargo</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">Year</label>
                            <input type="text" name="vehicleYear" value={formData.vehicleYear} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">Make</label>
                            <input type="text" name="vehicleMake" value={formData.vehicleMake} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">Model</label>
                            <input type="text" name="vehicleModel" value={formData.vehicleModel} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                          </div>
                        </div>
                      )}

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Project Notes</label>
                        <textarea name="notes" value={formData.notes} onChange={handleFormChange} rows={3} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"></textarea>
                      </div>
                    </div>
                  </section>

                  <section className="bg-zinc-950 p-6 rounded-lg border border-zinc-800">
                    <h2 className="text-xl font-semibold mb-4 border-b border-zinc-800 pb-2 text-yellow-500">3. Internal Estimation</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Material Type</label>
                        <select name="selectedMaterialId" value={formData.selectedMaterialId} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none">
                          {inventory.map((mat) => (
                            <option key={mat.id} value={mat.id}>{mat.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Est. Material (sq ft)</label>
                        <input type="number" name="sqFt" value={formData.sqFt} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Est. Labor (Hours)</label>
                        <input type="number" name="hours" value={formData.hours} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Labor Rate ($/hr)</label>
                        <input type="number" name="laborRate" value={formData.laborRate} onChange={handleFormChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" />
                      </div>
                    </div>
                  </section>

                  <div className="flex flex-col md:flex-row justify-between items-center bg-zinc-950 p-6 rounded-lg border border-yellow-600/30 gap-6">
                    <div>
                      <p className="text-zinc-400 text-sm">Estimated Initial Base Quote</p>
                      <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mt-1">${liveEstimatedSubtotal.toFixed(2)}</p>
                    </div>
                    <button type="submit" className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-bold rounded-md hover:from-yellow-500 hover:to-yellow-300 transition shadow-lg text-lg">
                      Save as Lead File
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* INVENTORY MANAGER */}
            {currentView === 'inventory' && (
               <div className="max-w-6xl mx-auto w-full animate-fade-in">
                  <h2 className="text-3xl font-bold text-white mb-6">Inventory Manager</h2>
                  <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 mb-8 shadow-lg">
                    <h3 className="text-lg font-bold text-yellow-500 mb-4 border-b border-zinc-800 pb-2">Add New Material</h3>
                    <form onSubmit={handleAddMaterial} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Material Name / Color</label>
                        <input type="text" value={newMaterial.name} onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Category</label>
                        <select value={newMaterial.category} onChange={(e) => setNewMaterial({...newMaterial, category: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none">
                          <option value="Vinyl">Vinyl</option><option value="Tint">Window Tint</option><option value="PPF">PPF</option><option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Price ($/sqft)</label>
                        <input type="number" step="0.01" value={newMaterial.pricePerSqFt} onChange={(e) => setNewMaterial({...newMaterial, pricePerSqFt: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">Initial Stock (sqft)</label>
                        <input type="number" value={newMaterial.stockSqFt} onChange={(e) => setNewMaterial({...newMaterial, stockSqFt: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none" required />
                      </div>
                      <div className="md:col-span-5 flex justify-end mt-2">
                        <button type="submit" className="px-6 py-2 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-bold rounded-md hover:from-yellow-500 hover:to-yellow-300 transition">+ Add Material</button>
                      </div>
                    </form>
                  </div>

                  <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase">
                        <tr><th className="p-4">Material Name</th><th className="p-4">Category</th><th className="p-4 text-right">Price/Sqft</th><th className="p-4">Stock</th></tr>
                      </thead>
                      <tbody>
                        {inventory.map(m => (
                          <tr key={m.id} className="border-t border-zinc-800">
                            <td className="p-4">{m.name}</td>
                            <td className="p-4"><span className="bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-xs">{m.category}</span></td>
                            <td className="p-4 text-right text-yellow-500">${parseFloat(m.pricePerSqFt).toFixed(2)}</td>
                            <td className="p-4">{m.stockSqFt} sqft</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </div>
            )}

            {/* UNIFIED CUSTOMER CRM DIRECTORY */}
            {currentView === 'crm-directory' && (
              <div className="max-w-6xl mx-auto w-full animate-fade-in flex flex-col h-full">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                  <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Master Customer CRM Directory</h2>
                    <p className="text-sm text-zinc-400 mt-1">Unified registry of all historical files, active projects, and archived records.</p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <div className="relative flex-grow sm:w-64">
                      <input 
                        type="text"
                        placeholder="🔍 Search client, phone, status..."
                        value={crmSearchTerm}
                        onChange={(e) => setCrmSearchTerm(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-yellow-500 rounded-lg py-2 px-4 text-white text-xs outline-none transition"
                      />
                    </div>
                    <select 
                      value={crmSortRule} 
                      onChange={(e) => setCrmSortRule(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-xs font-bold text-yellow-500 outline-none focus:border-yellow-500 transition cursor-pointer"
                    >
                      <option value="newest">📅 Date: Newest Registered</option>
                      <option value="oldest">📅 Date: Oldest History</option>
                      <option value="name-az">🔤 Name: Alphabetical (A-Z)</option>
                      <option value="name-za">🔤 Name: Alphabetical (Z-A)</option>
                      <option value="value-high">💰 Revenue: Highest Invoice</option>
                      <option value="value-low">💰 Revenue: Lowest Invoice</option>
                    </select>
                  </div>
                </div>

                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase font-bold border-b border-zinc-800">
                      <tr>
                        <th className="p-4">Client Name</th>
                        <th className="p-4">Contact Details</th>
                        <th className="p-4">Vehicle Specs</th>
                        <th className="p-4 text-center">Lifecycle Status Flag</th>
                        <th className="p-4 text-right">Running File Total</th>
                        <th className="p-4 text-center">Data Controls</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {processedCrmRecords.length === 0 && (
                        <tr><td colSpan={6} className="p-12 text-center text-zinc-500 italic">No matching client records found.</td></tr>
                      )}
                      {processedCrmRecords.map(lead => (
                        <tr key={lead.id} className="border-t border-zinc-800/60 hover:bg-zinc-950/40 transition">
                          <td className="p-4 font-extrabold text-white">
                            <button onClick={() => setSelectedJob(lead)} className="hover:text-yellow-500 text-left transition outline-none">
                              {lead.customerName}
                            </button>
                          </td>
                          <td className="p-4 text-zinc-400">
                            <div className="text-xs font-bold font-mono text-zinc-300">{lead.phone}</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[180px]">{lead.email || 'No email logged'}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-xs font-bold text-zinc-300">{lead.vehicleYear} {lead.vehicleMake} {lead.vehicleModel}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider font-semibold">{lead.jobType}</div>
                          </td>
                          <td className="p-4 text-center">
                            {lead.archived ? (
                              <span className="text-[9px] font-black bg-purple-950/40 border border-purple-800/60 text-purple-400 py-1 px-2.5 rounded-full uppercase tracking-wider">📁 Potential Lead</span>
                            ) : lead.status === 'Delivered' ? (
                              <span className="text-[9px] font-black bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 py-1 px-2.5 rounded-full uppercase tracking-wider">🎉 Past Customer</span>
                            ) : (
                              <span className="text-[9px] font-black bg-blue-950/40 border border-blue-800/60 text-blue-400 py-1 px-2.5 rounded-full uppercase tracking-wider">⚡ Active Board: {lead.status}</span>
                            )}
                          </td>
                          <td className="p-4 text-right font-black text-zinc-300 font-mono">${lead.total?.toFixed(2)}</td>
                          <td className="p-4">
                            <div className="flex gap-2 justify-center">
                              {lead.archived ? (
                                <button onClick={() => handleUnarchiveLead(lead.id)} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-[11px] px-2.5 py-1 rounded transition font-bold uppercase tracking-wider">
                                  🔄 Restore
                                </button>
                              ) : (
                                <button onClick={() => handleArchiveLead(lead.id)} className="bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 text-[11px] px-2.5 py-1 rounded transition font-bold uppercase tracking-wider">
                                  📁 Archive
                                </button>
                              )}
                              <button onClick={() => handleDeleteLead(lead.id)} className="bg-red-950/20 border border-red-900/40 hover:bg-red-900 text-red-300 text-[11px] px-2.5 py-1 rounded transition font-bold uppercase tracking-wider">
                                🗑️ Wipe
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* PROJECT FILE METRICS MODAL EXPLORER */}
      {selectedJob && !documentMode && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-black">
              <div className="flex items-center gap-3">
                <img src={LOGO_URL} alt="" className="h-8 object-contain rounded" />
                <div>
                  <h2 className="text-xl font-black text-white">{selectedJob.customerName}</h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">Record ID: #{selectedJob.id} | Location: {selectedJob.street}, {selectedJob.city}</p>
                </div>
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-zinc-500 text-2xl hover:text-white transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-grow">
              
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <span className="text-xs uppercase text-zinc-500 tracking-wider font-bold block mb-1">Current Stage Override Menu</span>
                  <select 
                    value={selectedJob.status} 
                    onChange={(e) => updateJobStatus(selectedJob.id, e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded p-1.5 font-bold text-yellow-500 outline-none text-sm focus:ring-1 focus:ring-yellow-500"
                  >
                    {workflowStages.map(stage => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase text-zinc-500 tracking-wider font-bold block">Running Total</span>
                  <span className="text-emerald-400 font-black text-2xl font-mono">${selectedJob.total?.toFixed(2)}</span>
                </div>
              </div>

              {/* ACTION EXECUTION INTERACTION PANEL */}
              <div className="bg-zinc-950 p-5 rounded-xl border border-yellow-500/10 shadow-inner">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-grow">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-yellow-500 mb-1">Workflow Execution Panel</h3>
                    <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
                      {selectedJob.status === 'Lead' && "Review scope specs below, then generate and send the proposal quote."}
                      {selectedJob.status === 'Quoted' && "Quote document sent. Awaiting client approval."}
                      {selectedJob.status === 'In Queue' && "Staged project in pipeline queue."}
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row md:flex-col gap-2 w-full md:w-auto items-stretch sm:items-center md:items-end">
                    {selectedJob.status === 'Lead' && (
                      <>
                        <button onClick={() => handleActionTrigger('quote_sent')} className="bg-gradient-to-r from-blue-600 to-blue-400 text-white font-bold py-2.5 px-4 rounded hover:from-blue-500 text-sm shadow transition text-center">
                          📄 Send Proposal Quote
                        </button>
                        <div className="flex gap-2 w-full">
                          <button onClick={() => handleArchiveLead(selectedJob.id)} className="flex-1 border border-zinc-800 bg-zinc-900 text-zinc-400 text-xs py-2 px-2 rounded hover:text-white hover:bg-zinc-800 transition">
                            📁 Save Future Lead
                          </button>
                          <button onClick={() => handleDeleteLead(selectedJob.id)} className="flex-1 bg-red-950/50 border border-red-900/60 text-red-300 text-xs py-2 px-2 rounded hover:bg-red-900 hover:text-white transition">
                            🗑️ Delete Lead
                          </button>
                        </div>
                      </>
                    )}
                    
                    {selectedJob.status === 'Quoted' && (
                      <>
                        <button onClick={() => setDocumentMode('quote')} className="w-full border border-zinc-700 bg-zinc-900 text-zinc-300 text-xs py-2 px-4 rounded hover:bg-zinc-800 transition text-center">
                          🔎 View/Review Proposal
                        </button>
                        <button onClick={() => handleActionTrigger('approved')} className="w-full bg-gradient-to-r from-emerald-600 to-emerald-400 text-black font-black py-2.5 px-4 rounded hover:from-emerald-500 shadow text-sm transition text-center">
                          ✅ Client Approved Project
                        </button>
                        <button onClick={handleRegressStatus} className="w-full text-center border border-zinc-800 text-zinc-500 hover:text-white text-xs py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 transition">
                          ↩️ Undo (Move Back to Lead)
                        </button>
                      </>
                    )}

                    {selectedJob.status === 'In Queue' && (
                      <>
                        <button onClick={() => handleActionTrigger('ready_for_work')} className="w-full bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-black py-3 px-6 rounded hover:from-yellow-500 shadow tracking-wider uppercase text-xs transition text-center">
                          🚀 Ready for Work (Deploy to Bay)
                        </button>
                        <button onClick={handleRegressStatus} className="w-full text-center border border-zinc-800 text-zinc-500 hover:text-white text-xs py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 transition">
                          ↩️ Undo (Move Back to Quoted)
                        </button>
                      </>
                    )}

                    {selectedJob.status !== 'Lead' && selectedJob.status !== 'Quoted' && selectedJob.status !== 'In Queue' && selectedJob.status !== 'Delivered' && (
                      <div className="space-y-2 w-full">
                        {selectedJob.status === 'Install Complete' ? (
                          <button onClick={() => { setDocumentMode('invoice'); updateJobStatus(selectedJob.id, 'Invoiced'); }} className="w-full bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-bold py-2.5 px-4 rounded shadow hover:from-yellow-500 transition text-center text-sm">
                            🧾 Compile & Post Final Invoice
                          </button>
                        ) : (
                          <>
                            {selectedJob.status >= 'Invoiced' && (
                              <button onClick={() => setDocumentMode('invoice')} className="w-full border border-zinc-700 bg-zinc-900 text-zinc-300 text-xs py-2 px-4 rounded hover:bg-zinc-800 transition text-center block">
                                📑 View Active Invoice File
                              </button>
                            )}
                            <button onClick={handleAdvanceStatus} className="w-full bg-zinc-800 border border-zinc-700 text-white font-bold py-2.5 px-4 rounded hover:bg-zinc-700 shadow text-sm transition text-center block">
                              ➡️ Advance to Next Step
                            </button>
                            <button onClick={handleRegressStatus} className="w-full text-center border border-zinc-800 text-zinc-500 hover:text-white text-xs py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 transition block">
                              ↩️ Move to Previous Step
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {selectedJob.status === 'Delivered' && (
                      <div className="w-full text-center space-y-2">
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold py-2 px-4 rounded-full block">🎉 Closed / Fully Settled & Delivered</span>
                        <button onClick={handleRegressStatus} className="w-full border border-zinc-800 text-zinc-500 hover:text-white text-xs py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 transition block">
                          ↩️ Reopen File (Move Back)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ESTIMATION DATA CAPTURE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-4">
                  <h3 className="text-yellow-500 font-bold border-b border-zinc-800 pb-2 text-sm uppercase tracking-wider">Scope Scope & Material Specs</h3>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-400">Material Parameter (sq ft):</label>
                    <input type="number" value={selectedJob.sqFt} onChange={(e) => handleJobAdjustment('sqFt', e.target.value)} className="w-24 bg-zinc-800 border border-zinc-700 rounded p-1 text-white focus:ring-1 focus:ring-yellow-500 outline-none text-right font-mono" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-400">Labor Matrix (Hours):</label>
                    <input type="number" value={selectedJob.hours} onChange={(e) => handleJobAdjustment('hours', e.target.value)} className="w-24 bg-zinc-800 border border-zinc-700 rounded p-1 text-white focus:ring-1 focus:ring-yellow-500 outline-none text-right font-mono" />
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-900">
                    <label className="text-sm text-zinc-400">Misc Surcharges / Discounts ($):</label>
                    <input type="number" value={selectedJob.adjustment || ''} onChange={(e) => handleJobAdjustment('adjustment', e.target.value)} placeholder="0" className="w-24 bg-zinc-800 border border-zinc-700 rounded p-1 text-white focus:ring-1 focus:ring-yellow-500 outline-none text-right font-mono" />
                  </div>
                </div>

                <div className="flex flex-col h-full bg-zinc-950 p-6 rounded-xl border border-zinc-800">
                  <h3 className="text-zinc-400 font-bold border-b border-zinc-900 pb-2 text-sm uppercase tracking-wider mb-2">Internal Log & Shop Notes</h3>
                  <textarea value={selectedJob.notes || ''} onChange={handleSaveNotes} className="flex-grow w-full bg-zinc-900 border border-zinc-800 p-4 rounded focus:ring-1 focus:ring-yellow-500 outline-none text-sm resize-none text-zinc-300 font-mono" placeholder="Log specs..."></textarea>
                </div>
              </div>

            </div>

            <div className="p-4 border-t border-zinc-800 bg-black flex justify-end">
              <button onClick={() => setSelectedJob(null)} className="px-6 py-2 border border-zinc-800 rounded font-bold hover:bg-zinc-900 text-sm transition">Close Explorer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}