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

export default function App() {
  // --- STATE ---
  const [currentView, setCurrentView] = useState('board'); 
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [documentMode, setDocumentMode] = useState<'quote' | 'invoice' | null>(null); 
  const [fitToScreen, setFitToScreen] = useState(false); // New Screen Optimizer Toggle

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
    if(!confirm("Move this file out of the active flow and save as a Future CRM Lead?")) return;
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
    if(!confirm("CRITICAL WARNING: Are you sure you want to completely DELETE this lead file? This action is permanent and cannot be undone.")) return;
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

  const activeJobs = jobs.filter(j => !j.archived);
  const futureLeads = jobs.filter(j => j.archived);

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 flex flex-col relative">
      
      {/* NAV BAR */}
      <nav className="bg-black border-b border-yellow-600/30 p-4 sticky top-0 z-40 shadow-lg print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-600 to-yellow-300 flex items-center justify-center text-black font-bold italic text-xl">P</div>
            <h1 className="text-xl font-extrabold uppercase tracking-widest italic text-white leading-none">Precision</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-2 py-0.5 rounded-full ml-2">Live Cloud</span>
          </div>
          <div className="flex gap-2 md:gap-4 flex-wrap justify-center">
            <button onClick={() => {setCurrentView('intake'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-semibold text-sm ${currentView === 'intake' ? 'text-yellow-500' : 'text-zinc-400'}`}>+ New Intake</button>
            <button onClick={() => {setCurrentView('board'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-semibold text-sm ${currentView === 'board' ? 'text-yellow-500' : 'text-zinc-400'}`}>Workflow Board</button>
            <button onClick={() => {setCurrentView('inventory'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-semibold text-sm ${currentView === 'inventory' ? 'text-yellow-500' : 'text-zinc-400'}`}>Inventory</button>
            <button onClick={() => {setCurrentView('future-leads'); setDocumentMode(null);}} className={`px-3 py-1.5 rounded-md font-semibold text-sm relative ${currentView === 'future-leads' ? 'text-yellow-500' : 'text-zinc-400'}`}>
              📁 Future Leads
              {futureLeads.length > 0 && <span className="absolute -top-1 -right-2 bg-yellow-600 text-black font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{futureLeads.length}</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-grow p-4 md:p-6 flex flex-col">
        
        {/* VIEW QUOTE / INVOICE MODE */}
        {documentMode && selectedJob ? (
          <div className="max-w-4xl mx-auto w-full bg-white text-zinc-900 p-8 md:p-12 shadow-2xl rounded-sm mb-20 animate-fade-in">
            <div className="flex justify-between items-start border-b-2 border-zinc-100 pb-8 mb-8">
              <div>
                <h1 className="text-3xl font-black uppercase italic tracking-tighter">Precision <span className="text-yellow-600">Wraps & Tint</span></h1>
                <p className="text-sm text-zinc-500 mt-1">Cape Coral, FL | (239) 445-6022</p>
                <p className="text-sm text-zinc-500">www.precisiongraphicsco.com</p>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-light text-zinc-400 uppercase tracking-widest">
                  {documentMode === 'quote' ? 'Detailed Quote' : 'Invoice'}
                </h2>
                <p className="mt-2 font-bold text-zinc-800">{documentMode === 'quote' ? 'QTE' : 'INV'}-{selectedJob.id}</p>
                <p className="text-sm text-zinc-500">{new Date(selectedJob.created_at || Date.now()).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-12">
              <div>
                <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-widest mb-2">Prepared For:</h3>
                <p className="font-bold text-lg">{selectedJob.customerName}</p>
                <p className="text-zinc-600">{selectedJob.street}</p>
                <p className="text-zinc-600">{selectedJob.city}, {selectedJob.state} {selectedJob.zip}</p>
                <p className="text-zinc-600">{selectedJob.phone}</p>
              </div>
              <div>
                <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-widest mb-2">Project Specification:</h3>
                <p className="text-zinc-800 font-medium">{selectedJob.vehicleYear} {selectedJob.vehicleMake} {selectedJob.vehicleModel}</p>
                <p className="text-zinc-500 text-sm italic mt-1">Type: {selectedJob.jobType} ({selectedJob.location})</p>
              </div>
            </div>

            <table className="w-full mb-12">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400 font-bold">
                  <th className="py-3">Line Item / Description</th>
                  <th className="py-3 text-center">Qty</th>
                  <th className="py-3 text-right">Unit Rate</th>
                  <th className="py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-zinc-50">
                  <td className="py-4 font-semibold text-zinc-800">{activeMaterialName} Coverage</td>
                  <td className="py-4 text-center">{selectedJob.sqFt} sqft</td>
                  <td className="py-4 text-right">${activeMaterialRate.toFixed(2)}</td>
                  <td className="py-4 text-right font-medium">${(selectedJob.sqFt * activeMaterialRate).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-zinc-50">
                  <td className="py-4 font-semibold text-zinc-800">Professional Installation & Labor</td>
                  <td className="py-4 text-center">{selectedJob.hours} hrs</td>
                  <td className="py-4 text-right">${selectedJob.laborRate?.toFixed(2)}</td>
                  <td className="py-4 text-right font-medium">${(selectedJob.hours * selectedJob.laborRate).toFixed(2)}</td>
                </tr>
                {selectedJob.adjustment !== 0 && (
                  <tr className="border-b border-zinc-50 bg-zinc-50/50">
                    <td className="py-4 font-semibold text-zinc-800 italic">Custom Adjustment / Upgrade Bundle</td>
                    <td className="py-4 text-center">-</td>
                    <td className="py-4 text-right">-</td>
                    <td className="py-4 text-right font-medium text-yellow-600">
                      {selectedJob.adjustment > 0 ? '+' : ''}${selectedJob.adjustment.toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 space-y-3">
                <div className="flex justify-between text-zinc-500"><span>Subtotal:</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-zinc-500"><span>Estimated Tax (6.5%):</span><span>${taxAmount.toFixed(2)}</span></div>
                <div className="flex justify-between text-xl font-bold border-t-2 border-zinc-100 pt-3 text-zinc-900">
                  <span>{documentMode === 'quote' ? 'Total Estimate:' : 'Total Due:'}</span>
                  <span className="text-yellow-600">${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-12 flex gap-4 print:hidden">
              <button onClick={() => window.print()} className="bg-zinc-900 text-white px-8 py-3 rounded font-bold hover:bg-black transition">🖨️ Print or Save PDF</button>
              <button onClick={() => setDocumentMode(null)} className="border border-zinc-200 text-zinc-500 px-8 py-3 rounded font-bold hover:bg-zinc-50 transition">Back to Project Controls</button>
            </div>
          </div>
        ) : (
          <>
            {/* COMPACT WORKFLOW BOARD */}
            {currentView === 'board' && (
               <div className="flex-grow flex flex-col h-full animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Workflow Board</h2>
                      <p className="text-xs text-zinc-500">Click any card to edit specs, send quotes, or override columns.</p>
                    </div>
                    {/* OPTIMIZER TOGGLE ENGINE */}
                    <button 
                      onClick={() => setFitToScreen(!fitToScreen)} 
                      className="px-3 py-1 bg-zinc-900 border border-zinc-700 hover:border-yellow-500 text-xs rounded font-semibold text-zinc-300 flex items-center gap-1.5 transition"
                    >
                      {fitToScreen ? "↔️ Enable Scroll Mode" : "🔍 Fit All to Screen"}
                    </button>
                  </div>

                  {/* HIGH-COMPRESSION LAYOUT HUB */}
                  <div className={`flex ${fitToScreen ? 'flex-wrap xl:grid xl:grid-cols-5 gap-3' : 'gap-3 overflow-x-auto pb-4'} h-full items-start`}>
                    {workflowStages.map(stage => (
                      <div 
                        key={stage} 
                        className={`${fitToScreen ? 'w-full sm:w-[19%] xl:w-auto' : 'w-56'} bg-zinc-900/40 rounded-lg border border-zinc-800 p-2.5 flex-shrink-0`}
                      >
                        <h3 className="font-extrabold text-zinc-500 uppercase text-[10px] mb-2.5 tracking-wider flex justify-between items-center px-1">
                          <span className="truncate max-w-[80%]">{stage}</span>
                          <span className="bg-zinc-800 text-[9px] px-1.5 py-0.5 rounded text-zinc-400 font-bold">
                            {activeJobs.filter(j => j.status === stage).length}
                          </span>
                        </h3>
                        <div className={`space-y-2 ${fitToScreen ? 'max-h-[35vh]' : 'max-h-[70vh]'} overflow-y-auto px-0.5`}>
                          {activeJobs.filter(j => j.status === stage).map(job => (
                            <div 
                              key={job.id} 
                              onClick={() => setSelectedJob(job)} 
                              className="bg-zinc-950 p-2.5 rounded border border-zinc-800/80 hover:border-yellow-500 transition cursor-pointer shadow-md group relative"
                            >
                              <h4 className="font-bold text-zinc-200 text-xs truncate group-hover:text-white">{job.customerName}</h4>
                              <p className="text-[10px] text-zinc-500 truncate mt-0.5">{job.vehicleYear} {job.vehicleMake} {job.vehicleModel}</p>
                              <div className="mt-2 flex justify-between items-center border-t border-zinc-900/60 pt-1.5">
                                <span className="text-yellow-600 font-extrabold text-[11px]">${job.total?.toFixed(0)}</span>
                                <span className="text-[9px] text-zinc-500 group-hover:text-yellow-500 font-medium transition">Open ➡️</span>
                              </div>
                            </div>
                          ))}
                          {activeJobs.filter(j => j.status === stage).length === 0 && (
                            <p className="text-zinc-800 text-[10px] italic text-center py-3 border border-dashed border-zinc-900 rounded">Empty</p>
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
                        <label className="block