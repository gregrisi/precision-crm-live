import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { usePlacesWidget } from 'react-google-autocomplete';

// --- MINI COMPONENT FOR GOOGLE MAPS ---
// This forces Google Maps to wait until the Intake Form actually opens!
const AddressInput = ({ formData, setFormData }: any) => {
  const { ref } = usePlacesWidget<HTMLInputElement>({
    apiKey: 'AIzaSyDJygTGB49TR4hPg3lM_V-qMrBSQQbrs80',
    options: { types: ['address'], componentRestrictions: { country: 'us' } },
    onPlaceSelected: (place: any) => {
      let street = '',
        city = '',
        state = '',
        zip = '';

      place.address_components?.forEach((comp: any) => {
        const types = comp.types;
        if (types.includes('street_number')) street += comp.long_name + ' ';
        if (types.includes('route')) street += comp.long_name;
        if (types.includes('locality')) city = comp.long_name;
        if (types.includes('administrative_area_level_1'))
          state = comp.short_name;
        if (types.includes('postal_code')) zip = comp.long_name;
      });

      setFormData((prev: any) => ({
        ...prev,
        street: street.trim(),
        city,
        state,
        zip,
      }));
    },
  });

  return (
    <input
      ref={ref}
      name="street"
      defaultValue={formData.street}
      onChange={(e) =>
        setFormData((prev: any) => ({ ...prev, street: e.target.value }))
      }
      className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
      placeholder="Start typing an address..."
    />
  );
};

// --- SETTINGS ---
const workflowStages = [
  'Lead',
  'Quoted',
  'Work Start',
  'Prepped',
  'Waiting on Material',
  'Install Complete',
  'Invoiced',
  'Paid',
  'Delivered',
];

const TAX_RATE = 0.065; // 6.5% for Florida

export default function App() {
  // --- STATE ---
  const [currentView, setCurrentView] = useState('board');
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [invoiceMode, setInvoiceMode] = useState(false);

  const [inventory, setInventory] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    customerName: '',
    phone: '',
    email: '',
    street: '',
    city: '',
    state: 'FL',
    zip: '',
    jobType: 'vehicle',
    location: 'in-house',
    vehicleCategory: '',
    vehicleYear: '',
    vehicleMake: '',
    vehicleModel: '',
    jobAddress: '',
    notes: '',
    sqFt: '',
    selectedMaterialId: '',
    hours: '',
    laborRate: '100',
  });

  const [newMaterial, setNewMaterial] = useState({
    name: '',
    category: 'Vinyl',
    pricePerSqFt: '',
    stockSqFt: '',
  });

  // --- CLOUD FETCHING ON STARTUP ---
  useEffect(() => {
    fetchInventory();
    fetchJobs();
  }, []);

  async function fetchInventory() {
    const { data, error } = await supabase.from('inventory').select('*');
    if (data) {
      setInventory(data);
      if (data.length > 0)
        setFormData((prev) => ({ ...prev, selectedMaterialId: data[0].id }));
    }
    if (error) console.error('Error fetching inventory:', error);
  }

  async function fetchJobs() {
    const { data, error } = await supabase.from('jobs').select('*');
    if (data) setJobs(data);
    if (error) console.error('Error fetching jobs:', error);
  }

  // --- FUNCTIONS ---
  const handleStatusChange = async (jobId: number, newStatus: string) => {
    setJobs(
      jobs.map((job) =>
        job.id === jobId ? { ...job, status: newStatus } : job
      )
    );
    await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
  };

  const handleSaveNotes = async (e: any) => {
    const newNotes = e.target.value;
    setSelectedJob({ ...selectedJob, notes: newNotes });
    setJobs(
      jobs.map((job) =>
        job.id === selectedJob.id ? { ...job, notes: newNotes } : job
      )
    );
    await supabase
      .from('jobs')
      .update({ notes: newNotes })
      .eq('id', selectedJob.id);
  };

  const handleJobAdjustment = async (field: string, value: string) => {
    const numValue = value === '' ? 0 : parseFloat(value);
    const updatedJob = { ...selectedJob, [field]: numValue };

    const mat = inventory.find((m) => m.id === updatedJob.selectedMaterialId);
    const mRate = mat ? parseFloat(mat.pricePerSqFt) : 0;

    const mCost = (updatedJob.sqFt || 0) * mRate;
    const lCost = (updatedJob.hours || 0) * (updatedJob.laborRate || 0);
    const customAdjustment = updatedJob.adjustment || 0;
    updatedJob.total = mCost + lCost + customAdjustment;

    setSelectedJob(updatedJob);
    setJobs(jobs.map((job) => (job.id === updatedJob.id ? updatedJob : job)));

    await supabase
      .from('jobs')
      .update({
        [field]: numValue,
        total: updatedJob.total,
      })
      .eq('id', updatedJob.id);
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
      stockSqFt: parseFloat(newMaterial.stockSqFt) || 0,
    };

    const { error } = await supabase.from('inventory').insert([newMat]);

    if (!error) {
      setInventory([...inventory, newMat]);
      setNewMaterial({
        name: '',
        category: 'Vinyl',
        pricePerSqFt: '',
        stockSqFt: '',
      });
      alert('New material saved securely to the cloud!');
      if (!formData.selectedMaterialId)
        setFormData((prev) => ({ ...prev, selectedMaterialId: newMat.id }));
    } else {
      alert('Error saving material. Check console.');
      console.error(error);
    }
  };

  const handleSubmitJob = async (e: any) => {
    e.preventDefault();
    const selectedMat = inventory.find(
      (m) => m.id === formData.selectedMaterialId
    );
    const mCost =
      (parseFloat(formData.sqFt) || 0) *
      (selectedMat ? parseFloat(selectedMat.pricePerSqFt) : 0);
    const lCost =
      (parseFloat(formData.hours) || 0) * (parseFloat(formData.laborRate) || 0);

    const jobToInsert = {
      customerName: formData.customerName,
      phone: formData.phone,
      email: formData.email,
      street: formData.street,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
      jobType: formData.jobType,
      location: formData.location,
      vehicleCategory: formData.vehicleCategory,
      vehicleYear: formData.vehicleYear,
      vehicleMake: formData.vehicleMake,
      vehicleModel: formData.vehicleModel,
      jobAddress: formData.jobAddress,
      notes: formData.notes,
      sqFt: parseFloat(formData.sqFt) || 0,
      selectedMaterialId: formData.selectedMaterialId,
      hours: parseFloat(formData.hours) || 0,
      laborRate: parseFloat(formData.laborRate) || 100,
      adjustment: 0,
      status: 'Lead',
      total: mCost + lCost,
    };

    const { data, error } = await supabase
      .from('jobs')
      .insert([jobToInsert])
      .select();

    if (!error && data) {
      setJobs([...jobs, data[0]]);
      setFormData({
        customerName: '',
        phone: '',
        email: '',
        street: '',
        city: '',
        state: 'FL',
        zip: '',
        jobType: 'vehicle',
        location: 'in-house',
        vehicleCategory: '',
        vehicleYear: '',
        vehicleMake: '',
        vehicleModel: '',
        jobAddress: '',
        notes: '',
        sqFt: '',
        selectedMaterialId: inventory.length > 0 ? inventory[0].id : '',
        hours: '',
        laborRate: '100',
      });
      setCurrentView('board');
    } else {
      alert('Error saving project. Check console.');
      console.error(error);
    }
  };

  // --- LIVE MATH & RENDER UTILS ---
  const currentMaterial = inventory.find(
    (mat) => mat.id === formData.selectedMaterialId
  );
  const liveMaterialCost =
    (parseFloat(formData.sqFt) || 0) *
    (currentMaterial ? parseFloat(currentMaterial.pricePerSqFt) : 0);
  const liveLaborCost =
    (parseFloat(formData.hours) || 0) * (parseFloat(formData.laborRate) || 0);
  const liveEstimatedSubtotal = liveMaterialCost + liveLaborCost;

  const activeInvoiceMaterial = selectedJob
    ? inventory.find((m) => m.id === selectedJob.selectedMaterialId)
    : null;
  const activeMaterialRate = activeInvoiceMaterial
    ? parseFloat(activeInvoiceMaterial.pricePerSqFt)
    : 0;
  const activeMaterialName = activeInvoiceMaterial
    ? activeInvoiceMaterial.name
    : 'Material Cost';

  const subtotal = selectedJob ? selectedJob.total || 0 : 0;
  const taxAmount = subtotal * TAX_RATE;
  const grandTotal = subtotal + taxAmount;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 flex flex-col relative">
      {/* NAV BAR */}
      <nav className="bg-black border-b border-yellow-600/30 p-4 sticky top-0 z-40 shadow-lg print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-600 to-yellow-300 flex items-center justify-center text-black font-bold italic text-xl">
              P
            </div>
            <h1 className="text-xl font-extrabold uppercase tracking-widest italic text-white leading-none">
              Precision
            </h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-2 py-0.5 rounded-full ml-2 animate-pulse">
              Live Cloud
            </span>
          </div>
          <div className="flex gap-2 md:gap-4">
            <button
              onClick={() => {
                setCurrentView('intake');
                setInvoiceMode(false);
              }}
              className={`px-4 py-2 rounded-md font-semibold text-sm ${
                currentView === 'intake' ? 'text-yellow-500' : 'text-zinc-400'
              }`}
            >
              + New Intake
            </button>
            <button
              onClick={() => {
                setCurrentView('board');
                setInvoiceMode(false);
              }}
              className={`px-4 py-2 rounded-md font-semibold text-sm ${
                currentView === 'board' ? 'text-yellow-500' : 'text-zinc-400'
              }`}
            >
              Workflow Board
            </button>
            <button
              onClick={() => {
                setCurrentView('inventory');
                setInvoiceMode(false);
              }}
              className={`px-4 py-2 rounded-md font-semibold text-sm ${
                currentView === 'inventory'
                  ? 'text-yellow-500'
                  : 'text-zinc-400'
              }`}
            >
              Inventory
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-grow p-4 md:p-8 flex flex-col">
        {/* INVOICE VIEW */}
        {invoiceMode && selectedJob ? (
          <div className="max-w-4xl mx-auto w-full bg-white text-zinc-900 p-8 md:p-12 shadow-2xl rounded-sm animate-fade-in mb-20">
            <div className="flex justify-between items-start border-b-2 border-zinc-100 pb-8 mb-8">
              <div>
                <h1 className="text-3xl font-black uppercase italic tracking-tighter">
                  Precision{' '}
                  <span className="text-yellow-600">Wraps & Tint</span>
                </h1>
                <p className="text-sm text-zinc-500 mt-1">
                  Cape Coral, FL | (239) 445-6022
                </p>
                <p className="text-sm text-zinc-500">
                  www.precisiongraphicsco.com
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-4xl font-light text-zinc-300 uppercase tracking-widest">
                  Invoice
                </h2>
                <p className="mt-2 font-bold text-zinc-800">
                  INV-{selectedJob.id}
                </p>
                <p className="text-sm text-zinc-500">
                  {new Date(
                    selectedJob.created_at || Date.now()
                  ).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-12">
              <div>
                <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-widest mb-2">
                  Bill To:
                </h3>
                <p className="font-bold text-lg">{selectedJob.customerName}</p>
                <p className="text-zinc-600">{selectedJob.street}</p>
                <p className="text-zinc-600">
                  {selectedJob.city}, {selectedJob.state} {selectedJob.zip}
                </p>
                <p className="text-zinc-600">{selectedJob.phone}</p>
              </div>
              <div>
                <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-widest mb-2">
                  Service Location:
                </h3>
                <p className="text-zinc-800 font-medium">
                  {selectedJob.vehicleYear} {selectedJob.vehicleMake}{' '}
                  {selectedJob.vehicleModel}
                </p>
                <p className="text-zinc-500 text-sm italic mt-1">
                  Type: {selectedJob.jobType}
                </p>
              </div>
            </div>

            <table className="w-full mb-12">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400 font-bold">
                  <th className="py-3">Description</th>
                  <th className="py-3 text-center">Qty / Hrs</th>
                  <th className="py-3 text-right">Rate</th>
                  <th className="py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-zinc-50">
                  <td className="py-4 font-semibold text-zinc-800">
                    {activeMaterialName}
                  </td>
                  <td className="py-4 text-center">{selectedJob.sqFt} sqft</td>
                  <td className="py-4 text-right">
                    ${activeMaterialRate.toFixed(2)}
                  </td>
                  <td className="py-4 text-right font-medium">
                    ${(selectedJob.sqFt * activeMaterialRate).toFixed(2)}
                  </td>
                </tr>
                <tr className="border-b border-zinc-50">
                  <td className="py-4 font-semibold text-zinc-800">
                    Labor & Installation
                  </td>
                  <td className="py-4 text-center">{selectedJob.hours} hrs</td>
                  <td className="py-4 text-right">
                    ${selectedJob.laborRate?.toFixed(2)}
                  </td>
                  <td className="py-4 text-right font-medium">
                    ${(selectedJob.hours * selectedJob.laborRate).toFixed(2)}
                  </td>
                </tr>
                {selectedJob.adjustment !== 0 && (
                  <tr className="border-b border-zinc-50 bg-zinc-50/50">
                    <td className="py-4 font-semibold text-zinc-800 italic">
                      {selectedJob.adjustment > 0
                        ? 'Additional Fees / Upgrades'
                        : 'Courtesy Discount applied'}
                    </td>
                    <td className="py-4 text-center">-</td>
                    <td className="py-4 text-right">-</td>
                    <td className="py-4 text-right font-medium text-yellow-600">
                      {selectedJob.adjustment > 0 ? '+' : ''}$
                      {selectedJob.adjustment.toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 space-y-3">
                <div className="flex justify-between text-zinc-500">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Sales Tax (6.5%):</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t-2 border-zinc-100 pt-3 text-zinc-900">
                  <span>Total Due:</span>
                  <span className="text-yellow-600">
                    ${grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-12 flex gap-4 print:hidden">
              <button
                onClick={() => window.print()}
                className="bg-zinc-900 text-white px-8 py-3 rounded font-bold hover:bg-black transition"
              >
                🖨️ Print or Save PDF
              </button>
              <button
                onClick={() => setInvoiceMode(false)}
                className="border border-zinc-200 text-zinc-500 px-8 py-3 rounded font-bold hover:bg-zinc-50 transition"
              >
                Back to Project
              </button>
            </div>
          </div>
        ) : (
          /* STANDARD VIEWS */
          <>
            {/* WORKFLOW BOARD */}
            {currentView === 'board' && (
              <div className="flex-grow flex flex-col h-full animate-fade-in">
                <h2 className="text-3xl font-bold text-white mb-6">
                  Workflow Board
                </h2>
                {jobs.length === 0 && (
                  <p className="text-zinc-500 italic">
                    No active projects in the cloud. Add one via New Intake!
                  </p>
                )}
                <div className="flex gap-6 overflow-x-auto pb-4 h-full items-start">
                  {workflowStages.map((stage) => (
                    <div
                      key={stage}
                      className="w-80 bg-zinc-900/50 rounded-xl border border-zinc-800 p-4"
                    >
                      <h3 className="font-bold text-zinc-500 uppercase text-xs mb-4">
                        {stage}
                      </h3>
                      <div className="space-y-3">
                        {jobs
                          .filter((j) => j.status === stage)
                          .map((job) => (
                            <div
                              key={job.id}
                              onClick={() => setSelectedJob(job)}
                              className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 hover:border-yellow-500 transition cursor-pointer"
                            >
                              <h4 className="font-bold text-white">
                                {job.customerName}
                              </h4>
                              <p className="text-xs text-zinc-500 mt-1">
                                {job.vehicleYear} {job.vehicleMake}
                              </p>
                              <div className="mt-3 flex justify-between items-center border-t border-zinc-900 pt-2">
                                <span className="text-yellow-500 font-bold text-sm">
                                  ${job.total?.toFixed(2)}
                                </span>
                                <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded text-zinc-400">
                                  View Details
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FULL INTAKE FORM WITH GOOGLE MAPS AUTOCOMPLETE */}
            {currentView === 'intake' && (
              <div className="max-w-4xl mx-auto w-full bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 overflow-hidden mb-8 animate-fade-in">
                <form onSubmit={handleSubmitJob} className="p-8 space-y-8">
                  {/* Customer CRM Section */}
                  <section>
                    <h2 className="text-xl font-semibold mb-4 border-b border-zinc-700 pb-2 text-yellow-500">
                      1. Customer Information
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Customer Name
                        </label>
                        <input
                          type="text"
                          name="customerName"
                          value={formData.customerName}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Street Address
                        </label>
                        {/* THE NEW TRAP DOOR COMPONENT */}
                        <AddressInput
                          formData={formData}
                          setFormData={setFormData}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          name="city"
                          value={formData.city}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                          placeholder="Cape Coral"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          name="state"
                          value={formData.state}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          ZIP Code
                        </label>
                        <input
                          type="text"
                          name="zip"
                          value={formData.zip}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Job Details Section */}
                  <section>
                    <h2 className="text-xl font-semibold mb-4 border-b border-zinc-700 pb-2 text-yellow-500">
                      2. Job Details
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Job Type
                        </label>
                        <select
                          name="jobType"
                          value={formData.jobType}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        >
                          <option value="vehicle">Vehicle Wrap / Tint</option>
                          <option value="building">
                            Building / Architectural Tint
                          </option>
                          <option value="other">Other / Custom</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Work Location
                        </label>
                        <select
                          name="location"
                          value={formData.location}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        >
                          <option value="in-house">In-House (Shop)</option>
                          <option value="external">
                            External (Mobile/On-Site)
                          </option>
                        </select>
                      </div>

                      {formData.jobType === 'vehicle' && (
                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4 bg-zinc-950 p-4 rounded-md border border-yellow-600/30">
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">
                              Category
                            </label>
                            <select
                              name="vehicleCategory"
                              value={formData.vehicleCategory}
                              onChange={handleFormChange}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                            >
                              <option value="" disabled>
                                Select...
                              </option>
                              <option value="sedan">Sedan / Coupe</option>
                              <option value="suv">SUV / Crossover</option>
                              <option value="truck">Pickup Truck</option>
                              <option value="van">Work Van / Cargo</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">
                              Year
                            </label>
                            <input
                              type="text"
                              name="vehicleYear"
                              value={formData.vehicleYear}
                              onChange={handleFormChange}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">
                              Make
                            </label>
                            <input
                              type="text"
                              name="vehicleMake"
                              value={formData.vehicleMake}
                              onChange={handleFormChange}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-yellow-500 mb-1">
                              Model
                            </label>
                            <input
                              type="text"
                              name="vehicleModel"
                              value={formData.vehicleModel}
                              onChange={handleFormChange}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {formData.location === 'external' && (
                        <div className="md:col-span-2 bg-zinc-950 p-4 rounded-md border border-yellow-600/30">
                          <label className="block text-sm font-medium text-yellow-500 mb-1">
                            On-Site Service Address
                          </label>
                          <input
                            type="text"
                            name="jobAddress"
                            value={formData.jobAddress}
                            onChange={handleFormChange}
                            placeholder="Enter the address where work will be performed..."
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                          />
                        </div>
                      )}

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Project Notes / Requirements
                        </label>
                        <textarea
                          name="notes"
                          value={formData.notes}
                          onChange={handleFormChange}
                          rows={3}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        ></textarea>
                      </div>
                    </div>
                  </section>

                  {/* Seamless Estimation Section */}
                  <section className="bg-zinc-950 p-6 rounded-lg border border-zinc-800">
                    <h2 className="text-xl font-semibold mb-4 border-b border-zinc-800 pb-2 text-yellow-500">
                      3. Internal Estimation
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-zinc-400 mb-1">
                          Material Type
                        </label>
                        <select
                          name="selectedMaterialId"
                          value={formData.selectedMaterialId}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        >
                          {inventory.length === 0 && (
                            <option disabled value="">
                              Add material first...
                            </option>
                          )}
                          {inventory.map((mat) => (
                            <option key={mat.id} value={mat.id}>
                              {mat.name} (${mat.pricePerSqFt}/sqft)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-zinc-400 mb-1">
                          Est. Material (sq ft)
                        </label>
                        <input
                          type="number"
                          name="sqFt"
                          value={formData.sqFt}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-zinc-400 mb-1">
                          Est. Labor (Hours)
                        </label>
                        <input
                          type="number"
                          name="hours"
                          value={formData.hours}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-zinc-400 mb-1">
                          Labor Rate ($/hr)
                        </label>
                        <input
                          type="number"
                          name="laborRate"
                          value={formData.laborRate}
                          onChange={handleFormChange}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Footer Submit */}
                  <div className="flex flex-col md:flex-row justify-between items-center bg-zinc-950 p-6 rounded-lg border border-yellow-600/30 gap-6">
                    <div>
                      <p className="text-zinc-400 text-sm">
                        Estimated Subtotal
                      </p>
                      <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mt-1">
                        ${liveEstimatedSubtotal.toFixed(2)}
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-bold rounded-md hover:from-yellow-500 hover:to-yellow-300 transition shadow-[0_0_15px_rgba(234,179,8,0.2)] text-lg"
                    >
                      Save Project & Quote
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* INVENTORY MANAGER */}
            {currentView === 'inventory' && (
              <div className="max-w-6xl mx-auto w-full animate-fade-in">
                <h2 className="text-3xl font-bold text-white mb-6">
                  Inventory Manager
                </h2>

                <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 mb-8 shadow-lg">
                  <h3 className="text-lg font-bold text-yellow-500 mb-4 border-b border-zinc-800 pb-2">
                    Add New Material
                  </h3>
                  <form
                    onSubmit={handleAddMaterial}
                    className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
                  >
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-zinc-300 mb-1">
                        Material Name / Color
                      </label>
                      <input
                        type="text"
                        value={newMaterial.name}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            name: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">
                        Category
                      </label>
                      <select
                        value={newMaterial.category}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            category: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                      >
                        <option value="Vinyl">Vinyl</option>
                        <option value="Tint">Window Tint</option>
                        <option value="PPF">PPF</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">
                        Price ($/sqft)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newMaterial.pricePerSqFt}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            pricePerSqFt: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">
                        Initial Stock (sqft)
                      </label>
                      <input
                        type="number"
                        value={newMaterial.stockSqFt}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            stockSqFt: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        required
                      />
                    </div>
                    <div className="md:col-span-5 flex justify-end mt-2">
                      <button
                        type="submit"
                        className="px-6 py-2 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-bold rounded-md hover:from-yellow-500 hover:to-yellow-300 transition"
                      >
                        + Add Material
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase">
                      <tr>
                        <th className="p-4">Material Name</th>
                        <th className="p-4">Category</th>
                        <th className="p-4 text-right">Price/Sqft</th>
                        <th className="p-4">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-8 text-center text-zinc-500 italic"
                          >
                            Your cloud inventory is empty! Add your first
                            material above.
                          </td>
                        </tr>
                      )}
                      {inventory.map((m) => (
                        <tr key={m.id} className="border-t border-zinc-800">
                          <td className="p-4">{m.name}</td>
                          <td className="p-4">
                            <span className="bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-xs">
                              {m.category}
                            </span>
                          </td>
                          <td className="p-4 text-right text-yellow-500">
                            ${parseFloat(m.pricePerSqFt).toFixed(2)}
                          </td>
                          <td className="p-4">{m.stockSqFt} sqft</td>
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

      {/* JOB MODAL */}
      {selectedJob && !invoiceMode && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-black">
              <h2 className="text-2xl font-bold">{selectedJob.customerName}</h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-zinc-500 text-2xl hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-zinc-950 p-6 rounded-lg border border-zinc-800 flex justify-between items-center">
                <p className="text-zinc-400">
                  Current Status:{' '}
                  <span className="text-yellow-500 font-bold ml-2">
                    {selectedJob.status}
                  </span>
                </p>
                <p className="text-zinc-400 text-xl">
                  Current Total:{' '}
                  <span className="text-emerald-400 font-bold ml-2">
                    ${selectedJob.total?.toFixed(2)}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zinc-950 p-6 rounded-lg border border-zinc-800 space-y-4">
                  <h3 className="text-yellow-500 font-bold border-b border-zinc-800 pb-2">
                    Final Adjustments
                  </h3>
                  <p className="text-xs text-zinc-500 mb-4">
                    Update actual material or labor used before generating the
                    invoice.
                  </p>

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-300">
                      Actual Material (sq ft):
                    </label>
                    <input
                      type="number"
                      value={selectedJob.sqFt}
                      onChange={(e) =>
                        handleJobAdjustment('sqFt', e.target.value)
                      }
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded p-1 text-white focus:ring-1 focus:ring-yellow-500 outline-none text-right"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-300">
                      Actual Labor (Hours):
                    </label>
                    <input
                      type="number"
                      value={selectedJob.hours}
                      onChange={(e) =>
                        handleJobAdjustment('hours', e.target.value)
                      }
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded p-1 text-white focus:ring-1 focus:ring-yellow-500 outline-none text-right"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                    <label className="text-sm font-medium text-zinc-300">
                      Misc. Fee / Discount ($):
                    </label>
                    <input
                      type="number"
                      value={selectedJob.adjustment || ''}
                      onChange={(e) =>
                        handleJobAdjustment('adjustment', e.target.value)
                      }
                      placeholder="-50 or 100"
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded p-1 text-white focus:ring-1 focus:ring-yellow-500 outline-none text-right"
                    />
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2 tracking-widest">
                    Project Log / Notes
                  </label>
                  <textarea
                    value={selectedJob.notes || ''}
                    onChange={handleSaveNotes}
                    className="flex-grow w-full bg-zinc-950 border border-zinc-800 p-4 rounded focus:ring-1 focus:ring-yellow-500 outline-none text-sm resize-none"
                    placeholder="Update project progress here..."
                  ></textarea>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-zinc-800 mt-4">
                <button
                  onClick={() => setInvoiceMode(true)}
                  className="flex-grow bg-gradient-to-r from-yellow-600 to-yellow-400 text-black py-4 font-bold rounded shadow-lg hover:scale-[1.02] transition"
                >
                  Generate Invoice
                </button>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="px-8 border border-zinc-800 rounded font-bold hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
