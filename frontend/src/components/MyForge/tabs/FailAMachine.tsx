import React, { useEffect, useState, FormEvent } from "react";
import { OmniAPI } from "src/apis/OmniAPI";
import { FormIcon } from "src/components/Forms/Form";
import { Machine } from "src/interfaces";

import '../../Forms/styles/Form.scss';
import '../styles/UseAMachine.scss';

export const FailAMachineForm: React.FC = () => {
    
    const [machines, setMachines] = useState<Machine[]>([]);
    const [selectedMachineId, setSelectedMachineId] = useState<string>("_");
    // I think this data is for the email the user gets sent? There isn't a way to pass it in the request TODO:
    const [estimatedPercentCompleted, setEstimatedPercentCompleted] = useState<number | null>(null);
    const [printerErrorMessage, setPrinterErrorMessage] = useState<string>("");
    const [noticeableFaults, setNoticeableFaults] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);


    /**
     * Load Machines
     */
    useEffect(() => {
        const fetchMachines = async () => {
            const allMachines: Machine[] = await OmniAPI.getEvery("machines");
            setMachines(allMachines);
        };

        fetchMachines();
    }, []);

    const [inProgress, setInProgress] = useState<Record<string, { usage_start?: string; usage_duration?: number }>>({});

    const loadInProgress = () => {
        OmniAPI.getPublic("machinestatus").then((res: any) => {
            const all = [...(res?.loners ?? []), ...(res?.groups ?? []).flatMap((g: any) => g.machines ?? [])];
            setInProgress(Object.fromEntries(all.filter((m: any) => m.in_use).map((m: any) => [m.id, m])));
        }).catch(() => setInProgress({}));
    };

    useEffect(() => {
        loadInProgress();
    }, []);

    const failableMachines = machines.filter((machine) => machine.id in inProgress);

    const PERCENT_MARGIN = 25;

    /**
     * Progress through the scheduled duration, or null when it can't be worked out.
     * This is how far along the print *should* be, not where it actually failed.
     */
    const scheduledPercent = (): number | null => {
        const usage = inProgress[selectedMachineId];
        if (!usage?.usage_start || !usage?.usage_duration) return null;
        const elapsedSeconds = (Date.now() - new Date(usage.usage_start).getTime()) / 1000;
        return Math.round((elapsedSeconds / usage.usage_duration) * 100);
    };

    /**
     * A print found past its expected finish time tells us nothing about where it
     * actually failed -- it may have reached 100% or died at 70% hours earlier and
     * sat there. The printer knows; the site doesn't. So the percentage becomes
     * optional here rather than a number we'd be guessing at.
     */
    const isPastExpectedFinish = (): boolean => {
        const expected = scheduledPercent();
        return expected !== null && expected >= 100;
    };

    const confirmLooksRight = (): boolean => {
        const expectedPercent = scheduledPercent();
        if (expectedPercent === null) return true;

        // Nothing to check against when the volunteer didn't claim a percentage.
        if (estimatedPercentCompleted === null) return true;

        // Past its expected finish, any reported percentage is plausible.
        if (expectedPercent >= 100) return true;

        if (Math.abs(expectedPercent - estimatedPercentCompleted) > PERCENT_MARGIN) {
            return confirm(`Based on when it started, this print should be about ${Math.max(expectedPercent, 0)}% done, but you entered ${estimatedPercentCompleted}%. Is this the right machine?`);
        }
        return true;
    };

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
     * Handle Checkbox Change
     */
    const handleCheckboxChange = (fault: string) => {
        setNoticeableFaults((prevFaults) =>
            prevFaults.includes(fault)
                ? prevFaults.filter((f) => f !== fault)
                : [...prevFaults, fault]
        );
    };

    /**
     * Handle Form Submission
     */
    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!confirmLooksRight()) return;
        setIsSubmitting(true);
        const data: Record<string, any> = {
            machine_id: selectedMachineId,
            error_message: printerErrorMessage,
            noticeable_fault: noticeableFaults.join(", "),
            percentage: estimatedPercentCompleted,  // null when unknown; email omits it
        };
        try {
            const response = await OmniAPI.fail(data);
            if (response != null) {
                console.log("Response:", response);
                alert("An error occurred, please try again.");
                return;
            }
            alert("Success, machine failure email sent");
        } catch (error: any) {
            console.error("Error:", error);
            alert(error?.response?.data?.detail ?? "An error occurred, please try again.");
            if (error?.response?.status !== 502) return;
        } finally {
            setIsSubmitting(false);
            loadInProgress();
        }
        
        // Clear form
        const form = document.querySelector(".usage-form") as HTMLFormElement;
        form.reset();
        resetFormFields();
    };

    /**
     * Reset Form Fields
     */
    const resetFormFields = () => {
        setSelectedMachineId("_");
        setEstimatedPercentCompleted(null);
        setPrinterErrorMessage("");
        setNoticeableFaults([]);
    };
    
    return (
        <div className="use-a-machine">
            <form className="usage-form" onSubmit={handleSubmit}>
                <FormIcon />
                <h2>Machine Failure Form</h2>

                <label>Machine Selection</label>
                <select
                    className='styled-dropdown'
                    defaultValue="_"
                    onChange={(e) => handleSelectMachine(e.target.value)}
                    required
                >
                    <option className='styled-dropdown-placeholder' value="_" hidden>{failableMachines.length ? "Please Select a Machine" : "No machines are in use"}</option>
                    {failableMachines.map((machine: Machine) => (
                        <option className='styled-dropdown-option' key={machine.id} value={machine.id}>{machine.name}</option>
                    ))}
                </select>
        
                <div className="usage-duration">
                    <label>
                        Percent Completed{isPastExpectedFinish() ? " (optional)" : ""}
                    </label>
                    <input
                        type="number"
                        value={estimatedPercentCompleted ?? ""}
                        placeholder={isPastExpectedFinish() ? "unknown" : "0"}
                        min="0"
                        max="100"
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                                setEstimatedPercentCompleted(null);
                                return;
                            }
                            const value = parseInt(raw);
                            if (!Number.isNaN(value) && value >= 0 && value <= 100) {
                                setEstimatedPercentCompleted(value);
                            }
                        }}
                    />
                </div>
                {isPastExpectedFinish() && (
                    <small className="percent-hint">
                        This print is past its expected finish time, so we can't tell where it
                        failed. Enter the percentage the printer reported if you know it,
                        otherwise leave this blank and the email will just give the reason.
                    </small>
                )}
                <label>Error Message</label>
                <div className="resource-usage-form">
                    <input
                        type="text"
                        value={printerErrorMessage}
                        placeholder="Printer Error Message" 
                        onChange={(e) => setPrinterErrorMessage(e.target.value)}
                        required
                    />
                </div>

                <label>Noticeable Faults</label>
                <div className="noticeable-faults">
                    <div className="checkbox-labels">
                        <input
                            id='checkbox-layer-shift'
                            className='styled-checkbox'
                            type="checkbox"
                            checked={noticeableFaults.includes("Layer Shift")}
                            onChange={() => handleCheckboxChange("Layer Shift")}
                        />
                        <label htmlFor='checkbox-layer-shift' className='checkbox-label'>
                            Layer Shift
                        </label>
                    </div>

                    <div className="checkbox-labels">
                        <input
                            id='checkbox-filament-jam'
                            className='styled-checkbox'
                            type="checkbox"
                            checked={noticeableFaults.includes("Filament Jam")}
                            onChange={() => handleCheckboxChange("Filament Jam")}
                        />
                        <label htmlFor='checkbox-filament-jam' className='checkbox-label'>
                            Filament Jam
                        </label>
                    </div>

                    <div className="checkbox-labels">
                        <input
                            id='checkbox-bed-adhesion'
                            className='styled-checkbox'
                            type="checkbox"
                            checked={noticeableFaults.includes("Lack of Bed Adhesion")}
                            onChange={() => handleCheckboxChange("Lack of Bed Adhesion")}
                        />
                        <label htmlFor='checkbox-bed-adhesion' className='checkbox-label'>
                            Lack of Bed Adhesion
                        </label>
                    </div>

                    <div className="checkbox-labels">
                        <input
                            id='checkbox-other'
                            className='styled-checkbox'
                            type="checkbox"
                            checked={noticeableFaults.includes("Other")}
                            onChange={() => handleCheckboxChange("Other")}
                        />
                        <label htmlFor='checkbox-other' className='checkbox-label'>
                            Other
                        </label>
                    </div>
                </div>

                {selectedMachineId !== "_" && (
                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <span className="loading-spinner" aria-label="Submitting" />}
                        {isSubmitting ? "Submitting..." : "Submit"}
                    </button>
                )}
            </form>
        </div>
    );
};