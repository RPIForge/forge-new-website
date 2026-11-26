import React, { useCallback, useEffect, useState, ChangeEvent, FormEvent, useMemo } from "react";
import { OmniAPI } from "src/apis/OmniAPI";
import { Machine, Resource } from "src/interfaces";
import { useNavigate } from "react-router-dom";
import useAuth from "src/components/Auth/useAuth";
import { UserPermission } from "src/enums";
import { AdminCheck, AdminField, AdminFormHeading } from "src/components/Admin/AdminForm";
import dividerLine from '../../../assets/img/auth-divider.svg?url';

import '../styles/UsageForm.scss';

const LAST_PAGE = 4;

// Keeps what's been typed if the page reloads or you leave and come back, until it's submitted
const DRAFT_KEY = "machineUsageFormDraft";

interface UsageDraft {
    selectedMachineId: string;
    formData: { [key: string]: any };
    slotValues: ResourceSlotElement[];
    page: number;
}

const loadDraft = (): UsageDraft | null => {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        return raw ? JSON.parse(raw) as UsageDraft : null;
    } catch {
        return null;
    }
};

const saveDraft = (draft: UsageDraft) => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage unavailable */ }
};

const clearDraft = () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
};

const blankSlot = (slotId: string): ResourceSlotElement => ({
    slot_id: slotId,
    name: "_",
    brand: "_",
    color: "_",
    amount: 0,
    own: false,
    cost: 0,
});

export const DynamicMachineForm: React.FC = () => {

    const [draft] = useState(loadDraft);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [selectedMachineId, setSelectedMachineId] = useState<string>(draft?.selectedMachineId ?? "0");
    const [schema, setSchema] = useState<MachineSchemaResponse>({});
    const [formData, setFormData] = useState<{ [key: string]: any }>(draft?.formData ?? { hours: 0, minutes: 0, policy: false, reprint: false });
    const [slotValues, setSlotValues] = useState<ResourceSlotElement[]>(draft?.slotValues ?? []);
    const [page, setPage] = useState<number>(draft?.page ?? 1);

    useEffect(() => {
        saveDraft({ selectedMachineId, formData, slotValues, page });
    }, [selectedMachineId, formData, slotValues, page]);
    const [status, setStatus] = useState<{ text: string; type: "error" | "success" | "warning" | "" }>({ text: "", type: "" });
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    // Disabled machines are only listed for machine editors / superusers, and can't be selected by anyone
    const canSeeDisabled = hasPermission(UserPermission.CAN_EDIT_MACHINES);

    /**
     * Initial Step on Load
     */
    useEffect(() => {
        const fetchMachines = async () => {
            const allMachines: Machine[] = await OmniAPI.getEvery("machines");
            console.log("All machines:", allMachines);
            setMachines(allMachines);
        };

        fetchMachines();
    }, []);

    /**
     * Handle Machine Selection with placeholder protection
     */
    const handleSelectMachine = (id: string) => {
        if (id === "_" || id === selectedMachineId) {
            return;
        }
        // A different machine has different material slots, so start those over
        setSlotValues([]);
        setSchema({});
        setSelectedMachineId(id);
    };

    /**
     * Fetch Machine Schema on Machine Selection
     */
    useEffect(() => {
        if (selectedMachineId == "0") return;

        const fetchSchema = async () => {
            const schemaData: MachineSchemaResponse = await OmniAPI.get("use", `${selectedMachineId}/schema`);
            console.log("Schema for machine:", schemaData);
            setSchema(schemaData);
        };

        fetchSchema();

    }, [selectedMachineId]);

    /**
     * One entry per material slot, keeping anything already filled in for this machine
     */
    useEffect(() => {
        if (!schema.resource_slots) return;
        setSlotValues((prev) => schema.resource_slots.map((slot: ResourceSlotSchema) =>
            prev.find((value) => value.slot_id === slot.resource_slot_id) ?? blankSlot(slot.resource_slot_id)
        ));
    }, [schema]);

    const updateSlot = useCallback((updatedSlot: ResourceSlotElement) => {
        setSlotValues((prevSlots) => prevSlots.map((slot) => slot.slot_id === updatedSlot.slot_id ? updatedSlot : slot));
    }, []);

    function updateStatus(message: string, type: string) {
        setStatus({ text: message, type: type as "error" | "success" | "warning" | ""});
        try { document.getElementById('status-text')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {console.log('Failed to display status text')}
    }
    function clearStatus() {updateStatus("", "");}

    const toCount = (value: unknown) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    /**
     * Handle Form Submission
     */
    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (!formData.policy) {
            updateStatus("Please accept the usage policy.", "error");
            return;
        }

        console.log(slotValues);

        const resource_usages: { [key: string]: { resource_id: string, amount: number, is_own_material: boolean } } = {};
        slotValues.map((slot) => {
            if (slot.resource_id) {
                resource_usages[slot.slot_id] = {
                    resource_id: slot.resource_id,
                    amount: slot.amount * 1,
                    is_own_material: slot.own as boolean,
                };
            }
        });

        const duration_seconds = Math.ceil((toCount(formData.hours) * 3600) + (toCount(formData.minutes) * 60));
        console.log("Resource Usages:", resource_usages);
        const usageData = {
            as_org_id: null,
            duration_seconds: duration_seconds,
            resource_usages: resource_usages,
            is_reprint: formData.reprint,
        };

        console.log("Usage Data:", usageData);

        try {
            const response = await OmniAPI.use(selectedMachineId, usageData);
            console.log("Usage Response:", response);
            if (response == null) {
                clearDraft();
                updateStatus("Usage submitted successfully.", "success");
                window.setTimeout(() => navigate('../../status'), 1000);
            } else {
                throw new Error("An error occurred. Please try again.");
            }

        } catch (error: any) {
            const detail: string = error?.response?.data?.detail ?? error?.detail ?? "";
            if (error.status == 409 && /maintenance/i.test(detail)) {
                updateStatus("This machine is under maintenance and can't be used right now.", "error");
            } else if (error.status == 409 && /disabled/i.test(detail)) {
                updateStatus("This machine is disabled and can't be used.", "error");
            } else if (error.status == 409) {
                updateStatus("This machine is already in use. Please clear it before submitting a new usage.", "error");
            } else if (error.status == 404) {
                updateStatus("The selected machine does not exist.", "error");
            } else if (error.status == 403) {
                updateStatus("You are not permitted to use this machine.", "error");
            } else if (error.status == 422) {
                const problems = Array.isArray(error?.response?.data?.detail)
                    ? error.response.data.detail.map((d: any) => `${(d.loc ?? []).slice(1).join(' → ')}: ${d.msg}`).join('; ')
                    : detail;
                console.error("Usage form rejected:", error?.response?.data);
                updateStatus(`Some of the form data was invalid${problems ? ` (${problems})` : ''}. Please check the form and try again.`, "error");
            } else {
                updateStatus("An error occurred. Please try again.", "error");
            }
        }
    };

    const validateResourceUsage = (slotValue: ResourceSlotElement) => {
        if (!schema.resource_slots.find((slot: ResourceSlotSchema) => slot.resource_slot_id === slotValue.slot_id)?.allow_own_material && slotValue.own) {
            const displayName = schema.resource_slots.find((slot: ResourceSlotSchema) => slot.resource_slot_id === slotValue.slot_id)?.display_name;
            return `${displayName} does not allow personal material.`
        }

        if (!schema.resource_slots.find((slot: ResourceSlotSchema) => slot.resource_slot_id === slotValue.slot_id)?.allow_empty && slotValue.amount <= 0 && !slotValue.own) {
            const displayName = schema.resource_slots.find((slot: ResourceSlotSchema) => slot.resource_slot_id === slotValue.slot_id)?.display_name;
            return `Please enter an amount greater than 0 for ${displayName}.`
        }

        return null;
    }

    const handlePageChange = (page: number) => {
        //Check if machine is selected
        if (page == 2 && selectedMachineId == "0") {
            updateStatus("Please select a machine first.", "error");
            return;
        }

        //Check if resource is selected
        let amountWarning = "";

        if (page == 3) {
            const invalidSlot = slotValues.find((slot) => validateResourceUsage(slot));
            if (invalidSlot) {
                updateStatus(validateResourceUsage(invalidSlot) ?? "You should never see this message! Please contact the site administrators.", "error");
                return;
            }

            if (slotValues.some((slot) => Number(slot.amount) < 0)) {
                updateStatus("Please enter a valid amount of material", "error");
                return;
            }

            const bigSlot = slotValues.find((slot) => Number(slot.amount) > 2000);
            if (bigSlot) {
                amountWarning = bigSlot.own
                    ? `WARNING: The amount of material you selected for ${bigSlot.name} is greater than a single spool of filament. You will need to change the filament during the print. This is allowed, but please make sure you have enough material to complete the print - you will not able to use Forge resources to complete the print.`
                    : `WARNING: The amount of material you selected for ${bigSlot.name} is greater than a single spool of filament. You will need to change the filament during the print. This is allowed, but please alert a volunteer or room manager after you start the print, so they are aware.`;
            }
        }

        //Check if duration is valid
        if (page == 4 && ((toCount(formData.hours) == 0 && toCount(formData.minutes) == 0) || toCount(formData.hours) < 0 || toCount(formData.minutes) < 0)) {
            updateStatus("Please enter a valid duration.", "error");
            return;
        }

        if (amountWarning) {
            updateStatus(amountWarning, "warning");
        } else {
            clearStatus();
        }
        setPage(page);
    };

    const machineOptions = machines.filter((machine: Machine) => canSeeDisabled || !machine.disabled);

    return (
        <div className="usage-page">
            <form className="usage-card" onSubmit={handleSubmit} noValidate>
                <h1 className="admin-form__title">Machine Usage Form</h1>
                <img className="admin-form__divider" src={dividerLine} alt="" aria-hidden="true" />

                <div className="admin-form__body usage-card__body">
                    {page === 1 && (
                        <AdminField label="Choose a Machine" htmlFor="machine-select">
                            <select
                                id="machine-select"
                                value={selectedMachineId === "0" ? "" : selectedMachineId}
                                onChange={(e) => handleSelectMachine(e.target.value)}
                            >
                                <option value="" disabled>{machines.length ? "Select a machine" : "Loading…"}</option>
                                {machineOptions.map((machine: Machine) => (
                                    <option
                                        key={machine.id}
                                        value={machine.id}
                                        disabled={!!machine.maintenance_mode || !!machine.disabled}
                                    >
                                        {machine.name}
                                        {machine.maintenance_mode ? ' (Under Maintenance)' : machine.disabled ? ' (Disabled)' : ''}
                                    </option>
                                ))}
                            </select>
                        </AdminField>
                    )}

                    {/* Kept mounted so the material choices survive going Back and Next */}
                    {page === 2 && (
                        <div className="usage-card__materials">
                            {schema.resource_slots
                                ? <ResourceUsageForm slots={schema.resource_slots} values={slotValues} setSlots={updateSlot} />
                                : <p className="admin-form__text">Loading materials…</p>}
                        </div>
                    )}

                    {page === 3 && (
                        <div className="usage-card__duration">
                            <label htmlFor="hours">Usage Duration</label>
                            <div className="usage-card__time">
                                <input
                                    id="hours"
                                    type="number"
                                    inputMode="numeric"
                                    step="1"
                                    min="0"
                                    aria-label="Hours"
                                    value={Number.isNaN(formData.hours) ? '' : formData.hours}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, hours: e.target.valueAsNumber }))}
                                />
                                <span>hr</span>
                                <input
                                    id="minutes"
                                    type="number"
                                    inputMode="numeric"
                                    step="1"
                                    min="0"
                                    aria-label="Minutes"
                                    value={Number.isNaN(formData.minutes) ? '' : formData.minutes}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, minutes: e.target.valueAsNumber }))}
                                />
                                <span>min</span>
                            </div>
                        </div>
                    )}

                    {page === 4 && (
                        <>
                            <AdminCheck
                                id="policy"
                                label={<>Do you agree to the Machine Usage Policy?<span className="usage-card__required" aria-hidden="true">*</span></>}
                                checked={formData.policy}
                                onChange={(checked) => setFormData((prev) => ({ ...prev, policy: checked }))}
                            />
                            <AdminCheck
                                id="reprint"
                                label="Is this a reprint?"
                                checked={formData.reprint}
                                onChange={(checked) => setFormData((prev) => ({ ...prev, reprint: checked }))}
                            />
                        </>
                    )}
                </div>

                <p id="status-text" className={`usage-card__status usage-card__status--${status.type || "none"}`} role="status">
                    {status.text}
                </p>

                <div className="usage-card__nav">
                    <button
                        type="button"
                        className="admin-form__submit"
                        onClick={() => { clearStatus(); setPage(page - 1); }}
                        disabled={page === 1}
                    >
                        Back
                    </button>
                    {page !== LAST_PAGE ? (
                        <button key="next" type="button" className="admin-form__submit" onClick={() => handlePageChange(page + 1)}>
                            Next
                        </button>
                    ) : (
                        <button key="submit" type="submit" className="admin-form__submit">Submit</button>
                    )}
                </div>
            </form>
        </div>
    );
};


interface MachineSchemaResponse { [key: string]: any; }

interface ResourceSlotSchema {
    resource_slot_id: string;
    display_name: string;
    valid_resources: Resource[];
    allow_own_material: boolean;
    allow_empty: boolean;
}

interface ResourceSlotElement {
    slot_id: string;
    resource_id?: string;
    name: string;
    brand?: string;
    color?: string;
    amount: number;
    own?: boolean;
    cost: number;
}

interface ResourceUsageFormProps {
    slots: ResourceSlotSchema[];
    values: ResourceSlotElement[];
    setSlots: (updatedSlot: ResourceSlotElement) => void;
}

const ResourceUsageForm: React.FC<ResourceUsageFormProps> = ({ slots, values, setSlots }) => (
    <>
        {slots.map((slot, index) => (
            <ResourceSlot
                key={slot.resource_slot_id + index}
                slot={slot}
                value={values.find((v) => v.slot_id === slot.resource_slot_id) ?? blankSlot(slot.resource_slot_id)}
                setSlotValue={setSlots}
                showHeading={slots.length > 1}
            />
        ))}
        {slots.length === 0 && <p className="admin-form__text">This machine doesn't use any material.</p>}
    </>
);

interface ResourceSlotProps {
    slot: ResourceSlotSchema;
    value: ResourceSlotElement;
    setSlotValue: (slotValue: ResourceSlotElement) => void;
    showHeading?: boolean;
}

// Everything lives in the parent form, so nothing is lost when this page is hidden and shown again
const ResourceSlot: React.FC<ResourceSlotProps> = ({ slot, value, setSlotValue, showHeading }) => {
    const validResources = slot.valid_resources;

    const materialOptions = useMemo(() => [...new Set(validResources.map(r => r.name))], [validResources]);

    const matchingResource = (name: string, brand: string, color: string) =>
        validResources.find(r => r.name === name && (brand === "_" || r.brand === brand) && (color === "_" || r.color === color)) ?? null;

    const handleChange = (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        const { name, value: raw, type } = event.target;
        const newValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : raw;

        const updated: ResourceSlotElement = { ...value, [name]: newValue };
        const validBrands = validResources.filter(r => r.name === updated.name).map(r => r.brand);
        const validColors = validResources.filter(r => r.name === updated.name && r.brand === updated.brand).map(r => r.color);
        if (name === "name" && !validBrands.includes(updated.brand)) updated.brand = "_";
        if ((name === "name" || name === "brand") && !validColors.includes(updated.color)) updated.color = "_";
        const resource = matchingResource(updated.name, updated.brand || "_", updated.color || "_");
        const unitCost = parseFloat(String(resource?.cost ?? "0"));
        const amount = Number(updated.amount);
        updated.resource_id = resource?.id;
        updated.cost = updated.own || Number.isNaN(amount) ? 0 : amount * unitCost;
        setSlotValue(updated);
    };

    const cost = value.cost ?? 0;
    const selectedDetails = value;
    const selected = matchingResource(selectedDetails.name, selectedDetails.brand || "_", selectedDetails.color || "_");
    const idBase = `slot-${slot.resource_slot_id}`;

    return (
        <section className="usage-card__slot" aria-label={slot.display_name}>
            {showHeading && <AdminFormHeading>{slot.display_name}</AdminFormHeading>}
            <AdminField label="Material Quantity" htmlFor={`${idBase}-amount`}>
                <input
                    id={`${idBase}-amount`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    name="amount"
                    value={selectedDetails.amount}
                    onChange={handleChange}
                    placeholder={selected?.units ? `Amount in ${selected.units}` : undefined}
                />
            </AdminField>
            <AdminField label="Material" htmlFor={`${idBase}-material`}>
                <select id={`${idBase}-material`} name="name" value={selectedDetails.name} onChange={handleChange}>
                    <option value="_">Select a material</option>
                    {materialOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
            </AdminField>
            <img className="admin-form__divider usage-card__slot-divider" src={dividerLine} alt="" aria-hidden="true" />
            <AdminField label="Estimated Cost" htmlFor={`${idBase}-cost`}>
                <output id={`${idBase}-cost`} className="usage-card__cost">{"$" + cost.toFixed(2)}</output>
            </AdminField>
            <div className="admin-form__check">
                <input id={`${idBase}-own`} type="checkbox" name="own" checked={!!selectedDetails.own} onChange={handleChange} />
                <label htmlFor={`${idBase}-own`}>Are you using your own material?</label>
            </div>
        </section>
    );
};
