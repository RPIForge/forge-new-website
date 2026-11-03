import React, { useEffect, useState, FormEvent } from "react";
import styled from "styled-components";
import { OmniAPI } from "src/apis/OmniAPI";
import { Machine } from "src/interfaces";
import bgPattern from '../../../assets/img/background.svg?url';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
    navy:  '#111c36',
    red:   '#a51c1c',
    white: '#ffffff',
    black: '#000000',
};

// ── Page wrapper ──────────────────────────────────────────────────────────────

const PageWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: calc(100vh - 74px);
    padding: 40px 16px;
    box-sizing: border-box;
    background: #EEF2F8;
    position: relative;

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: url(${bgPattern});
        background-repeat: repeat;
        background-size: 122px 140px;
        opacity: 0.09;
        pointer-events: none;
    }
`;

// ── Card ──────────────────────────────────────────────────────────────────────

const Card = styled.div`
    position: relative;
    z-index: 1;
    background: ${C.white};
    border: 4px solid ${C.navy};
    border-radius: 12px;
    width: clamp(340px, 50vw, 600px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 12px 48px rgba(17,28,54,0.18), 0 2px 8px rgba(17,28,54,0.08);

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: url(${bgPattern});
        background-repeat: repeat;
        background-size: 122px 140px;
        opacity: 0.04;
        pointer-events: none;
        z-index: 0;
    }
`;

const CardInner = styled.div`
    position: relative;
    z-index: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 0 0 0;
`;

// ── Title band ────────────────────────────────────────────────────────────────

const TitleBand = styled.div`
    width: 100%;
    background: ${C.navy};
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const Title = styled.h2`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(20px, 2.5vw, 28px);
    font-weight: 700;
    color: ${C.white};
    text-align: center;
    margin: 0;
`;

// ── Fields ────────────────────────────────────────────────────────────────────

const FieldsArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    width: calc(100% - 40px);
    padding: 20px 0 12px 0;
`;

const FieldRow = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 6px 10px;
    width: 100%;
    justify-content: flex-end;

    @media screen and (max-width: 600px) {
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        padding: 6px 0;

        select, input, div { width: 100%; }
    }
`;

const FieldLabel = styled.label`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(14px, 1.5vw, 20px);
    font-weight: 700;
    color: ${C.black};
    white-space: nowrap;
    flex-shrink: 0;
`;

const FieldInput = styled.input`
    height: 32px;
    width: clamp(120px, 25vw, 300px);
    border: 2px solid ${C.black};
    border-radius: 5px;
    background: ${C.white};
    padding: 4px 8px;
    font-size: 14px;
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    outline: none;
    box-sizing: border-box;
    flex-shrink: 0;

    &:focus {
        border-color: ${C.navy};
        box-shadow: 0 0 0 2px rgba(17,28,54,0.15);
    }

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
        opacity: 1;
    }
`;

const FieldSelect = styled.select`
    height: 32px;
    width: clamp(120px, 25vw, 300px);
    border: 2px solid ${C.black};
    border-radius: 5px;
    background: ${C.white};
    padding: 4px 8px;
    font-size: 14px;
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    outline: none;
    box-sizing: border-box;
    flex-shrink: 0;
    cursor: pointer;

    &:focus {
        border-color: ${C.navy};
    }
`;

// ── Section divider ───────────────────────────────────────────────────────────

const SectionDivider = styled.div`
    width: calc(100% - 40px);
    height: 2px;
    background: #e2e8f0;
    flex-shrink: 0;
    margin: 4px 0;
`;

// ── Checkboxes ────────────────────────────────────────────────────────────────

const CheckboxArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: calc(100% - 40px);
    padding: 14px 10px 8px 10px;
`;

const FaultsLabel = styled.p`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(15px, 1.6vw, 20px);
    font-weight: 700;
    color: ${C.black};
    margin: 0 0 8px 0;
`;

const CheckRow = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 7px 0;
    width: 100%;
`;

const StyledCheckbox = styled.input`
    width: 22px;
    height: 22px;
    border: 2px solid ${C.black};
    border-radius: 4px;
    flex-shrink: 0;
    cursor: pointer;
    accent-color: ${C.navy};
`;

const CheckLabel = styled.label`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(13px, 1.3vw, 16px);
    font-weight: 700;
    color: ${C.black};
    cursor: pointer;
`;

// ── Submit button ─────────────────────────────────────────────────────────────

const SubmitBtn = styled.button`
    height: 44px;
    width: calc(100% - 40px);
    background: ${C.red};
    border: 2px solid ${C.black};
    border-radius: 6px;
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(16px, 1.8vw, 22px);
    font-weight: 700;
    color: ${C.white};
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.1s ease;
    margin: 0 0 20px 0;

    &:hover:not(:disabled) {
        background: #8a1515;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(165,28,28,0.3);
    }

    &:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: none;
    }

    &:disabled {
        background: #c9a0a0;
        border-color: #aaa;
        cursor: not-allowed;
    }
`;

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════

export const FailAMachineForm: React.FC = () => {
    
    const [machines, setMachines] = useState<Machine[]>([]);
    const [selectedMachineId, setSelectedMachineId] = useState<string>("_");
    // I think this data is for the email the user gets sent? There isn't a way to pass it in the request TODO:
    const [estimatedPercentCompleted, setEstimatedPercentCompleted] = useState(0);
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
        setIsSubmitting(true);
        const data: Record<string, any> = {
            machine_id: selectedMachineId,
            error_message: printerErrorMessage,
            noticeable_fault: noticeableFaults.join(", "),
            percentage: estimatedPercentCompleted,
        };
        try {
            const response = await OmniAPI.fail(data);
            if (response != null) {
                console.log("Response:", response);
                alert("An error occurred, please try again.");
            }
            alert("Success, machine failure email sent");
        } catch (error) {
            console.error("Error:", error);
            alert("An error occurred, please try again.");
        } finally {
            setIsSubmitting(false);
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
        setEstimatedPercentCompleted(0);
        setPrinterErrorMessage("");
        setNoticeableFaults([]);
    };
    
    const FAULTS = ["Layer Shift", "Filament Jam", "Lack of Bed Adhesion", "Other"];

    return (
        <PageWrapper>
            <Card>
                <CardInner>
                    <form className="usage-form" onSubmit={handleSubmit} style={{ width: '100%', display: 'contents' }}>

                        <TitleBand><Title>Failure Form</Title></TitleBand>

                        <FieldsArea>
                            <FieldRow>
                                <FieldLabel htmlFor="machine-select">Machine</FieldLabel>
                                <FieldSelect
                                    id="machine-select"
                                    defaultValue="_"
                                    onChange={(e) => handleSelectMachine(e.target.value)}
                                    required
                                >
                                    <option value="_" hidden>Please Select a Machine</option>
                                    {machines.map((machine: Machine) => (
                                        <option key={machine.id} value={machine.id}>{machine.name}</option>
                                    ))}
                                </FieldSelect>
                            </FieldRow>

                            <FieldRow>
                                <FieldLabel htmlFor="percent-completed">Percent Completed</FieldLabel>
                                <FieldInput
                                    id="percent-completed"
                                    type="number"
                                    value={estimatedPercentCompleted}
                                    placeholder="0"
                                    min="0"
                                    max="100"
                                    onChange={(e) => {
                                        const value = parseInt(e.target.value);
                                        if (value >= 0 && value <= 100) {
                                            setEstimatedPercentCompleted(value);
                                        }
                                    }}
                                />
                            </FieldRow>

                            <FieldRow>
                                <FieldLabel htmlFor="error-message">Error Message</FieldLabel>
                                <FieldInput
                                    id="error-message"
                                    type="text"
                                    value={printerErrorMessage}
                                    placeholder="Printer Error Message"
                                    onChange={(e) => setPrinterErrorMessage(e.target.value)}
                                    required
                                />
                            </FieldRow>
                        </FieldsArea>

                        <SectionDivider />

                        <CheckboxArea>
                            <FaultsLabel>Noticeable Faults</FaultsLabel>
                            {FAULTS.map((fault) => (
                                <CheckRow key={fault}>
                                    <StyledCheckbox
                                        id={`fault-${fault.toLowerCase().replace(/\s+/g, '-')}`}
                                        type="checkbox"
                                        checked={noticeableFaults.includes(fault)}
                                        onChange={() => handleCheckboxChange(fault)}
                                    />
                                    <CheckLabel htmlFor={`fault-${fault.toLowerCase().replace(/\s+/g, '-')}`}>
                                        {fault}
                                    </CheckLabel>
                                </CheckRow>
                            ))}
                        </CheckboxArea>

                        <SectionDivider style={{ margin: '12px 0 16px' }} />

                        <SubmitBtn type="submit" disabled={isSubmitting || selectedMachineId === "_"}>
                            {isSubmitting ? "Submitting..." : "Submit"}
                        </SubmitBtn>

                    </form>
                </CardInner>
            </Card>
        </PageWrapper>
    );
};
