import React, { useEffect, useState, ChangeEvent, FormEvent, ReactNode, Suspense, useMemo, createContext, useContext } from "react";
import { OmniAPI } from "src/apis/OmniAPI";
import { CheckboxInput, CustomForm, CustomFormField, DropdownInput, FormIcon, TextInput } from "src/components/Forms/Form";
import { ClaimableFailure, emptyMachine, Machine, Resource } from "src/interfaces";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom"
import '../../Forms/styles/Form.scss';
import '../styles/UseAMachine.scss';
import * as Select from '@radix-ui/react-select';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { AxiosError } from "axios";
import useAuth from "src/components/Auth/useAuth";
import { UserPermission } from "src/enums";


interface MachineSchemaResponse {
    [key: string]: any;
}

/** Database IDs specific to UsageForm Testing
 * Resource IDs:
 *   "acc18d23-19db-4c6e-b3c8-fdf79e19b6e6"
 *   "0897f0dc-eb66-41f2-b179-e76ced9aad69"
 *   "23fb8bf6-7d0c-4029-8810-f19fe85bfb38"
 *   "da36be80-2dcb-43a7-88b2-885e3ce387f6"
 *   "c96423f3-fbea-4993-8455-e929f333a820"
 *   "5a7c609b-df2f-48b4-9028-a0222a13b7a9"
 *   "fec63512-f7d3-46c9-a89a-c0f4e0b5c8b7"
 *   "f0f83ef1-a4c5-4fc9-8ff8-821c7658f7ad"
 *
 * Reource Slot IDs:
 *   "6fad9ba9-2093-40cc-81d4-5443bc8d06f8"
 *   "af30b008-1f52-4e77-91ec-67dc8d61fa75"
 *   "73cd77a0-1a74-4047-9c2c-ce08d1062963"
 * 
 * Machine Type IDs:
 *   "2cc65063-23a9-41b5-ab5a-fb451f6ef547"
 *
 * Machine Group IDs:
 *   "9d18bb70-cf67-4903-a78d-073722bb9ff2"
 *
 * Machine IDs:
 *   "d8aa3861-a1f3-4c1d-a154-018936173dc4"
*/

export const DynamicMachineForm: React.FC = () => {

    const [machines, setMachines] = useState<Machine[]>([]);
    const [selectedMachineId, setSelectedMachineId] = useState<string>("0");
    const [schema, setSchema] = useState<MachineSchemaResponse>({});
    const [formData, setFormData] = useState<{ [key: string]: any }>({ hours: 0, minutes: 0, policy: false, reprint: false, reprint_of_id: "" });
    // Failed prints this member can still claim a free reprint against. Only
    // fetched once the reprint box is ticked, since most usages aren't reprints.
    const [claimableFailures, setClaimableFailures] = useState<ClaimableFailure[]>([]);
    const [failuresLoaded, setFailuresLoaded] = useState<boolean>(false);
    const [slotValues, setSlotValues] = useState<ResourceSlotElement[]>([{
        slot_id: "_",
        name: "_",
        amount: 0,
        own: false,
        cost: 0,
    }]);
    const [resourceUsageForm, setResourceUsageForm] = useState<ReactNode>(null);
    const [page, setPage] = useState<number>(1);
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
     * Fetch Claimable Failed Prints when the reprint box is ticked
     *
     * Each failed print earns exactly one free reprint, so the member has to
     * say which failure they are claiming. The backend refuses a print that
     * has already been reprinted rather than quietly charging for it, which it
     * can only do if it knows which print was meant.
     */
    useEffect(() => {
        if (!formData.reprint || failuresLoaded) return;

        const fetchClaimableFailures = async () => {
            try {
                const failures: ClaimableFailure[] = await OmniAPI.getAll("usages/me/claimable-failures");
                console.log("Claimable failures:", failures);
                setClaimableFailures(failures);
            } catch (error) {
                // Not fatal: the member can still submit without choosing, and
                // the backend falls back to the newest claimable failure.
                console.log("Failed to load claimable failures", error);
                setClaimableFailures([]);
            }
            setFailuresLoaded(true);
        };

        fetchClaimableFailures();
    }, [formData.reprint, failuresLoaded]);


    /**
     * Why the chosen failure wouldn't be free, when it wouldn't be. Shown
     * before submitting so the charge isn't a surprise afterwards.
     */
    const selectedFailureReason = useMemo(() => {
        const chosen = claimableFailures.find((failure) => failure.id === formData.reprint_of_id);
        return chosen && !chosen.eligible ? chosen.reason : null;
    }, [claimableFailures, formData.reprint_of_id]);


    /**
     * Handle Machine Selection with placeholder protection
     */
    const handleSelectMachine = (id: string) => {
        if (id === "_") {
            return;
        }
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
     * Generate Resource Usage Form on Schema Load
     */
    useEffect(() => {
        if (!schema.resource_slots) return;

        const initialValues: ResourceSlotElement[] = schema.resource_slots.map((slot: ResourceSlotSchema) => ({
            slot_id: slot.resource_slot_id,
            name: "_",
            amount: 0,
            own: false,
            cost: 0,
        }));

        setSlotValues(initialValues);

        const fieldId = uuidv4();
        const resourceUsageProps = {
            slots: schema.resource_slots,
            initialValues,
            setSlots: (updatedSlot: ResourceSlotElement) => {
                setSlotValues((prevSlots) => {
                    const newSlots = [...prevSlots];
                    const slotIndex = newSlots.findIndex((slot) => slot.slot_id === updatedSlot.slot_id);
                    newSlots[slotIndex] = updatedSlot;
                    return newSlots;
                });
            }
        };

        const newResourceUsageForm = <ResourceUsageForm key={fieldId} {...resourceUsageProps} />;
        setResourceUsageForm(newResourceUsageForm);
    }, [schema]);

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

        if (formData.reprint && claimableFailures.length > 0 && !formData.reprint_of_id) {
            updateStatus("Please choose which failed print this is a reprint of.", "error");
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
            // Null rather than "" so the backend falls back to picking the
            // newest claimable failure when nothing was chosen.
            reprint_of_id: formData.reprint && formData.reprint_of_id ? formData.reprint_of_id : null,
        };

        console.log("Usage Data:", usageData);

        try {
            const result = await OmniAPI.use(selectedMachineId, usageData);
            console.log("Usage Response:", result);
            // Getting here means the API accepted it: OmniAPI.use throws on any
            // non-200, so there is nothing further to check.
            if (result?.reprint_note) {
                // Marked as a reprint but it didn't qualify for a free one. The
                // usage is logged and charged, so this is a warning rather than
                // an error, and it stays on screen long enough to be read.
                updateStatus(result.reprint_note, "error");
                window.setTimeout(() => navigate('../../status'), 6000);
            } else if (result?.free_reprint) {
                updateStatus("Usage submitted. Your free reprint was applied.", "success");
                window.setTimeout(() => navigate('../../status'), 2000);
            } else {
                updateStatus("Usage submitted successfully.", "success");
                window.setTimeout(() => navigate('../../status'), 1000);
            }

        } catch (error: any) {
            const detail: string = error?.response?.data?.detail ?? error?.detail ?? "";
            // Read the status off the response first: AxiosError only gained a
            // top-level .status in a later 1.x, and package.json allows ^1.7.9.
            const httpStatus = error?.response?.status ?? error?.status;
            if (httpStatus == 400 && typeof detail === "string" && detail) {
                // Usage rules (the reprint policy, resource slot checks) reject with
                // a message written for the person submitting, so show it as-is
                // rather than burying it behind "an error occurred".
                updateStatus(detail, "error");
            } else if (httpStatus == 409 && /maintenance/i.test(detail)) {
                updateStatus("This machine is under maintenance and can't be used right now.", "error");
            } else if (httpStatus == 409 && /disabled/i.test(detail)) {
                updateStatus("This machine is disabled and can't be used.", "error");
            } else if (httpStatus == 409) {
                updateStatus("This machine is already in use. Please clear it before submitting a new usage.", "error");
            } else if (httpStatus == 404) {
                updateStatus("The selected machine does not exist.", "error");
            } else if (httpStatus == 403) {
                updateStatus("You are not permitted to use this machine.", "error");
            } else if (httpStatus == 422) {
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

            const bigSlot = slotValues.find((slot) => Number(slot.amount) > 1000);
            if (slotValues.find((slot) => Number(slot.amount) > 1950)){
                updateStatus("Exceeding the amount of filament that is allowed on one print in the Forge", "error");
                return;
            }
            if (bigSlot) {
                amountWarning = bigSlot.own
                    ? `WARNING: The amount of material you selected for ${bigSlot.name} is greater than a single spool of filament. You will need to change the filament during the print. This is allowed, but please make sure you have enough material to complete the print - you will not able to use Forge resources to complete the print.`
                    : `WARNING: The amount of material you selected for ${bigSlot.name} is greater than a single spool of filament. You will need to change the filament during the print. This is allowed, but please alert a volunteer or room manager after you start the print, so they are aware.`;
            }
        }

        //Check if duration is valid
        if (page == 4 && ((toCount(formData.hours) == 0 && toCount(formData.minutes) == 0) || toCount(formData.hours) < 0 || toCount(formData.minutes) < 0 || toCount(formData.hours) > 48 || toCount(formData.minutes) > 59)) {
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


    return (
        <div className="use-a-machine">
            <form className="usage-form" onSubmit={handleSubmit}>
                <FormIcon />
                <h2>Machine Usage Form</h2>
                {page == 1 &&
                    <div className="machine-selection">
                        <label>1. Machine Selection</label>
                        <Select.Root
                            value={selectedMachineId === "0" ? "" : selectedMachineId}
                            onValueChange={handleSelectMachine}
                        >
                            <Select.Trigger className="machine-select-trigger" aria-label="Select a machine">
                                <Select.Value placeholder="Please Select a Machine" />
                                <Select.Icon aria-hidden>
                                    <ChevronDownIcon />
                                </Select.Icon>
                            </Select.Trigger>
                            <Select.Portal>
                                <Select.Content className="machine-select-content" position="popper" sideOffset={4}>
                                    <Select.Viewport>
                                        {machines.filter((machine: Machine) => canSeeDisabled || !machine.disabled).map((machine: Machine) => (
                                            <Select.Item
                                                className="machine-select-item"
                                                key={machine.id}
                                                value={machine.id}
                                                disabled={machine.maintenance_mode || machine.disabled}
                                            >
                                                <Select.ItemText>
                                                    {machine.name}
                                                    {machine.maintenance_mode ? ' (Under Maintenance)' : machine.disabled ? ' (Disabled)' : ''}
                                                </Select.ItemText>
                                            </Select.Item>
                                        ))}
                                    </Select.Viewport>
                                </Select.Content>
                            </Select.Portal>
                        </Select.Root>
                    </div>
                }


                {page == 2 && resourceUsageForm}


                {page == 3 &&
                    <div className="usage-duration">
                        <label>3. Usage Duration</label>
                        <input
                            id="hours"
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            step="1"
                            min="0"
                            placeholder="Hours"
                            onChange={(e) => setFormData((prev) => ({ ...prev, 'hours': e.target.valueAsNumber }))}
                            value={Number.isNaN(formData.hours) ? '' : formData.hours}
                        />
                        <label htmlFor="hours">hr</label>
                        <input
                            id="minutes"
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            step="1"
                            min="0"
                            placeholder="Minutes"
                            onChange={(e) => setFormData((prev) => ({ ...prev, 'minutes': e.target.valueAsNumber }))}
                            value={Number.isNaN(formData.minutes) ? '' : formData.minutes}
                        />
                        <label htmlFor="minutes">min</label>
                    </div>
                }

                {page == 4 &&
                    <div className="usage-policies">
                        <input
                            id='checkbox-usage-policy'
                            className='styled-checkbox'
                            type="checkbox"
                            onChange={(e) => setFormData((prev) => ({ ...prev, 'policy': e.target.checked }))}
                        />
                        <label
                            htmlFor='checkbox-usage-policy'
                            className='checkbox-label'
                        >
                            <span style={{ color: 'red' }}>*</span>
                            Do you agree to the Machine Usage Policy? 
                        </label>
                        <input
                            id='checkbox-reprint'
                            className='styled-checkbox'
                            type="checkbox"
                            onChange={(e) => setFormData((prev) => ({ ...prev, 'reprint': e.target.checked }))}
                        />
                        <label
                            htmlFor='checkbox-reprint'
                            className='checkbox-label'
                        >
                            Is this a reprint?
                        </label>
                        {formData.reprint &&
                            <div className="reprint-claim">
                                {claimableFailures.length === 0
                                    ? <p className="reprint-claim-note">
                                        You have no failed print left to claim. Each failed print
                                        earns one free reprint, so this will be charged as a normal
                                        print.
                                    </p>
                                    : <>
                                        <label htmlFor='reprint-of' className='checkbox-label'>
                                            <span style={{ color: 'red' }}>*</span>
                                            Which failed print is this a reprint of?
                                        </label>
                                        <select
                                            id='reprint-of'
                                            value={formData.reprint_of_id}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, 'reprint_of_id': e.target.value }))}
                                        >
                                            <option value="">Select a failed print...</option>
                                            {claimableFailures.map((failure) => (
                                                <option key={failure.id} value={failure.id}>
                                                    {`${failure.machine_name} - ${new Date(failure.failed_at ?? failure.time_started).toLocaleDateString()} - ${Number(failure.forge_grams).toFixed(1)}g${failure.eligible ? "" : " (will be charged)"}`}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedFailureReason &&
                                            <p className="reprint-claim-note">{selectedFailureReason}</p>
                                        }
                                    </>
                                }
                            </div>
                        }
                    </div>
                }

                <div id="status-text" className={`status-text ${status.type === "success" ? "success" : status.type === "error" ? "error" : status.type === "warning" ? "warning" : ""}`}>{status.text}</div>
                <div className="pagination-buttons">
                    <button type="button" onClick={() => {clearStatus(); setPage(page - 1)}} disabled={page === 1}>Back</button>
                    {page !== 4 && <button type="button" onClick={() => handlePageChange(page + 1)} disabled={page === 4}>Next</button>}
                    {page == 4 && <button type="submit">Submit</button>}
                </div>

            </form>
        </div >
    );
};


/** This interface will serve as the master version of the schema - not the editable state version */
interface ResourceSlotSchema {
    resource_slot_id: string;
    display_name: string;
    valid_resources: Resource[];
    allow_own_material: boolean;
    allow_empty: boolean;
}


/** This is an interface to use as a template to populate the ResourceSlotElement into a state
 *  An instance should be created for each resource slot in the 
 *  machine schema, and then populated with the setSlots function
 */
interface ResourceSlotElement {
    slot_id: string;
    resource_id?: string;
    name: string;
    amount: number;
    own?: boolean;
    cost: number;
}

/** Passing along a state object wouldn't have worked, so when slotValues updated, initialValues will need to be updated concurrently */
interface ResourceUsageFormProps {
    slots: ResourceSlotSchema[];
    initialValues: ResourceSlotElement[];
    setSlots: (updatedSlot: ResourceSlotElement) => void;
}

/* This is a CustomField for the CustomForm Component to use */
const ResourceUsageForm: React.FC<ResourceUsageFormProps> = ({ slots, initialValues, setSlots }) => {

    const [slotValues, setSlotValues] = useState<ResourceSlotElement[]>(initialValues);

    const handleSlotChange = (slotValue: ResourceSlotElement) => {
        const newSlotValues = [...slotValues];
        const slotIndex = newSlotValues.findIndex((slot) => slot.slot_id === slotValue.slot_id);
        newSlotValues[slotIndex] = slotValue;
        setSlotValues(newSlotValues);
    }

    return (
        <Suspense fallback={<div>Loading...</div>}>
            <div className="resource-usage-form">
                <label>2. Resource Selection</label>
                <table>
                    <thead>
                        <tr>
                            <th>Slot Name</th>
                            <th>Material</th>
                            <th className="amount">Amount</th>
                            <th className="own-material">Personal Material</th>
                            <th>Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slots.map((slot, index) => (
                            <ResourceSlot
                                key={slot.resource_slot_id + index}
                                slot={slot}
                                slotValue={initialValues[index]}
                                setSlotValue={setSlots}
                            />
                        ))}
                    </tbody>

                </table>
            </div >
        </Suspense>
    );
};

interface ResourceSlotProps {
    slot: ResourceSlotSchema;
    slotValue: ResourceSlotElement;
    setSlotValue: (slotValue: ResourceSlotElement) => void;
}


const ResourceSlot: React.FC<ResourceSlotProps> = ({ slot, slotValue, setSlotValue}) => {
    const [selectedDetails, setSelectedDetails] = useState<ResourceSlotElement>({
        slot_id: slot.resource_slot_id,
        name: "_",
        amount: 0,
        own: false,
        cost: 0,
    });

    const [cost, setCost] = useState(0);

    const validResources = slot.valid_resources;

    // Get unique materials (always available)
    const materialOptions = useMemo(() => [...new Set(validResources.map(resource => resource.name))], [validResources]);

    // Find the best matching resource
    const matchingResource = (name: string) => {
        return validResources.find(resource =>
            resource.name === name
        ) ?? null;
    };

    const updateSelectedDetails = (name: string, newValue: string | boolean) => {
        setSelectedDetails(prev => {
            let updatedDetails = { ...prev, [name]: newValue };

            // Find best resource with the selected options
            const resource = matchingResource(updatedDetails.name);
            const unitCost = parseFloat(resource?.cost ?? "0");
            updatedDetails.cost = updatedDetails.own ? 0 : (updatedDetails.amount * unitCost);

            return updatedDetails;
        });
    };

    const handleChange = (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        const { name, value, type } = event.target;
        const newValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : value;
        updateSelectedDetails(name, newValue);
    };

    useEffect(() => {
        const matchedResource = validResources.find(resource =>
            resource.name === selectedDetails.name
        );

        setSlotValue({
            slot_id: selectedDetails.slot_id,
            resource_id: matchedResource?.id,
            name: selectedDetails.name,
            amount: Number.isNaN(selectedDetails.amount) ? 0 : selectedDetails.amount,
            own: selectedDetails.own,
            cost: cost,
        });
    }, [selectedDetails, setSlotValue]);

    useEffect(() => {
        setCost(selectedDetails.cost);
    }, [selectedDetails.cost]);

    return (
        <tr>
            <td data-label="Slot Name">{slot.display_name}</td>
            {/* Material Dropdown (Always available) */}
            <td data-label="Material">
                <Select.Root
                    value={selectedDetails.name}
                    onValueChange={(value) => updateSelectedDetails("name", value)}
                    required={!slot.allow_empty}
                >
                    <Select.Trigger className="resource-select-trigger" aria-label="Select material">
                        <Select.Value />
                        <Select.Icon aria-hidden>
                            <ChevronDownIcon />
                        </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                        <Select.Content className="resource-select-content" position="popper" sideOffset={4}>
                            <Select.Viewport>
                                <Select.Item className="resource-select-item" value="_">
                                    <Select.ItemText>--Material--</Select.ItemText>
                                </Select.Item>
                                {materialOptions.map(name => (
                                    <Select.Item className="resource-select-item" key={name} value={name}>
                                        <Select.ItemText>{name}</Select.ItemText>
                                    </Select.Item>
                                ))}
                            </Select.Viewport>
                        </Select.Content>
                    </Select.Portal>
                </Select.Root>
            </td>

            {/* Amount Input */}
            <td data-label="Amount">
                <input
                    type="number"
                    name="amount"
                    value={selectedDetails.amount}
                    onChange={handleChange}
                    required={!slot.allow_empty}
                />
            </td>

            {/* Own Checkbox */}
            <td data-label="Personal Material">
                <input
                    type="checkbox"
                    name="own"
                    checked={selectedDetails.own}
                    onChange={handleChange}
                />
            </td>

            {/* Cost Display */}
            <td data-label="Cost">
                {"$" + cost.toFixed(2)}
            </td>
        </tr>
    );
};
