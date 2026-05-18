import React, { useState, useEffect } from 'react';
import { supabase } from './supabase'; 
import { usePlacesWidget } from "react-google-autocomplete"; 

// --- MINI COMPONENT FOR GOOGLE MAPS ---
const AddressInput = ({ formData, setFormData }: any) => {
  const { ref } = usePlacesWidget<HTMLInputElement>({
    apiKey: "YOUR_GOOGLE_MAPS_API_KEY_HERE",
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
  const [currentView, setCurrentView] = useState('board'); // 'board' | 'intake' | 'inventory' | 'future-leads'
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [documentMode, setDocumentMode] = useState<'quote' | 'invoice' | null>(null); 

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

  // Split active pipeline vs future lead archive
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
              📁 Future Leads Vault
              {futureLeads.length > 0 && <span className="absolute -top-1 -right-2 bg-yellow-600 text-black font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{futureLeads.length}</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-grow p-4 md:p-8 flex flex-col">
        
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
            {/* WORKFLOW BOARD */}
            {currentView === 'board' && (
               <div className="flex-grow flex flex-col h-full animate-fade-in">
                  <h2 className="text-3xl font-bold text-white mb-6">Workflow Board</h2>
                  <div className="flex gap-6 overflow-x-auto pb-4 h-full items-start">
                    {workflowStages.map(stage => (
                      <div key={stage} className="w-80 bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 flex-shrink-0">
                        <h3 className="font-bold text-zinc-500 uppercase text-xs mb-4 tracking-wider flex justify-between">
                          <span>{stage}</span>
                          <span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-normal">
                            {activeJobs.filter(j => j.status === stage).length}
                          </span>
                        </h3>
                        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
                          {activeJobs.filter(j => j.status === stage).map(job => (
                            <div key={job.id} onClick={() => setSelectedJob(job)} className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 hover:border-yellow-500 transition cursor-pointer shadow-md">
                              <h4 className="font-bold text-white">{job.customerName}</h4>
                              <p className="text-xs text-zinc-400 mt-1">{job.vehicleYear} {job.vehicleMake} {job.vehicleModel}</p>
                              <div className="mt-3 flex justify-between items-center border-t border-zinc-900 pt-2">
                                <span className="text-yellow-500 font-bold text-sm">${job.total?.toFixed(2)}</span>
                                <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded text-zinc-400 uppercase tracking-tight font-semibold">Open File</span>
                              </div>
                            </div>
                          ))}
                          {activeJobs.filter(j => j.status === stage).length === 0 && (
                            <p className="text-zinc-700 text-xs italic text-center py-4 border border-dashed border-zinc-800/40 rounded-lg">Empty Column</p>
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

            {/* FUTURE LEADS REPOSITORY VIEW */}
            {currentView === 'future-leads' && (
              <div className="max-w-6xl mx-auto w-full animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-white">Future CRM Leads Vault</h2>
                    <p className="text-sm text-zinc-400 mt-1">Stored marketing contacts and cold proposal files outside the active production floor.</p>
                  </div>
                  <span className="bg-yellow-600/20 border border-yellow-500/30 text-yellow-400 px-4 py-1.5 rounded-md font-mono text-sm font-bold">Total Staged: {futureLeads.length}</span>
                </div>

                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase font-bold">
                      <tr>
                        <th className="p-4">Client Name</th>
                        <th className="p-4">Contact Detail</th>
                        <th className="p-4">Film Intent</th>
                        <th className="p-4 text-right">Quote Value</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {futureLeads.length === 0 && (
                        <tr><td colSpan={5} className="p-12 text-center text-zinc-500 italic">No archived future leads found. File them using the panel on active Leads.</td></tr>
                      )}
                      {futureLeads.map(lead => (
                        <tr key={lead.id} className="border-t border-zinc-800/60 hover:bg-zinc-950/40 transition">
                          <td className="p-4 font-bold text-white">{lead.customerName}</td>
                          <td className="p-4 text-zinc-400">
                            <div className="text-xs">{lead.phone}</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">{lead.email || 'No email log'}</div>
                          </td>
                          <td className="p-4">
                            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{lead.vehicleYear} {lead.vehicleMake}</span>
                            <div className="text-[10px] bg-zinc-800 border border-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded w-max mt-1 uppercase font-bold">{lead.jobType}</div>
                          </td>
                          <td className="p-4 text-right font-bold text-emerald-400">${lead.total?.toFixed(2)}</td>
                          <td className="p-4">
                            <div className="flex gap-2 justify-center">
                              <button onClick={() => handleUnarchiveLead(lead.id)} className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white text-xs px-3 py-1 rounded font-medium transition">
                                🔄 Restore to Board
                              </button>
                              <button onClick={() => handleDeleteLead(lead.id)} className="bg-red-950/40 border border-red-900/60 hover:bg-red-900 text-red-200 text-xs px-3 py-1 rounded font-medium transition">
                                🗑️ Wipe File
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
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedJob.customerName}</h2>
                <p className="text-xs text-zinc-400 mt-1">Project ID: #{selectedJob.id} | Specs: {selectedJob.street}, {selectedJob.city}</p>
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-zinc-500 text-2xl hover:text-white transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-grow">
              
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <span className="text-xs uppercase text-zinc-500 tracking-wider font-bold block">Current Stage</span>
                  <span className="text-yellow-500 font-extrabold text-xl tracking-wide">{selectedJob.status}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase text-zinc-500 tracking-wider font-bold block">Running Total</span>
                  <span className="text-emerald-400 font-black text-2xl">${selectedJob.total?.toFixed(2)}</span>
                </div>
              </div>

              {/* ACTION EXECUTION INTERACTION PANEL */}
              <div className="bg-zinc-950 p-5 rounded-xl border border-yellow-600/20 shadow-inner">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-grow">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-yellow-500 mb-1">Workflow Execution Panel</h3>
                    <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
                      {selectedJob.status === 'Lead' && "Review scope specs below, then generate and send the proposal quote. If the lead goes cold, you can delete or archive the file."}
                      {selectedJob.status === 'Quoted' && "Quote document sent. Awaiting explicit client confirmation approval to switch file into the queue."}
                      {selectedJob.status === 'In Queue' && "Staged project in pipeline queue. Awaiting vehicle delivery drop-off matrix assignment to activate project floor work."}
                      {selectedJob.status === 'Work Start' && "Active vehicle file. Track film usage parameters, installation labor, and record wrap notes."}
                      {selectedJob.status === 'Install Complete' && "Wrap installation complete. Run billing compiler to post the invoice profile."}
                      {selectedJob.status >= 'Invoiced' && "Financial billing view tracking stage."}
                    </p>
                  </div>
                  
                  {/* WORKFLOW DISPATCH CONTROLLER ENGINE */}
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
                        <button onClick={() => handleDeleteLead(selectedJob.id)} className="w-full text-center text-red-400/70 hover:text-red-400 text-xs pt-1 transition">
                          Cancel & Wipe File
                        </button>
                      </>
                    )}

                    {selectedJob.status === 'In Queue' && (
                      <button onClick={() => handleActionTrigger('ready_for_work')} className="w-full bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-black py-3 px-6 rounded hover:from-yellow-500 shadow tracking-wider uppercase text-xs transition text-center">
                        🚀 Ready for Work (Deploy to Bay)
                      </button>
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
                          </>
                        )}
                      </div>
                    )}

                    {selectedJob.status === 'Delivered' && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold py-2 px-4 rounded-full text-center">🎉 Closed / Fully Settled & Delivered</span>
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