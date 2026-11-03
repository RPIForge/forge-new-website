import React, { useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import bgPattern from '../../assets/img/background.svg?url';
import rulerMask from '../../assets/img/ruler-mask-tile.svg?url';
import anvilImg from '../../assets/img/anvil_with_benchys.png';
import PageRuler from '../shared/PageRuler';
import Majors from './data/sorted_majors.json';
import { OmniAPI } from '../../apis/OmniAPI';
import axios from 'axios';

// ── Assets ─────────────────────────────────────────────────────────────────────
const ANVIL_URL = anvilImg;
const RULER_URL = rulerMask;

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
    navy:  '#111c36',
    red:   '#a51c1c',
    white: '#ffffff',
};

// ── Styled components ──────────────────────────────────────────────────────────

const PageBackground = styled.div`
    position: relative;
    width: 100%;
    min-height: calc(100vh - 74px);
    background: linear-gradient(to right, ${C.red} 0%, #2d4a80 100%);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    overflow: hidden;

    @media screen and (max-width: 700px) {
        justify-content: center;
        padding: 24px 0;
    }
`;

const AnvilImage = styled.img`
    position: absolute;
    left: 4%;
    top: 50%;
    transform: translateY(-50%);
    height: 100%;
    max-height: 816px;
    width: auto;
    object-fit: contain;
    pointer-events: none;
    user-select: none;

    @media screen and (max-width: 700px) {
        display: none;
    }
`;

const FormCard = styled.div`
    position: relative;
    z-index: 2;
    background: ${C.white};
    border: 4px solid ${C.navy};
    border-radius: 10px;
    width: clamp(320px, 38vw, 552px);
    padding: 0 0 20px 0;
    margin-right: clamp(24px, 6vw, 96px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 8px 32px rgba(17,28,54,0.25);

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: url(${bgPattern});
        background-repeat: repeat;
        background-size: 122px 140px;
        opacity: 0.03;
        pointer-events: none;
        z-index: 0;
    }

    @media screen and (max-width: 700px) {
        width: calc(100% - 48px);
        margin-right: 24px;
        margin-left: 24px;
    }
`;

const CardInner = styled.div`
    position: relative;
    z-index: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
`;

const Title = styled.h1`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(20px, 2.5vw, 30px);
    font-weight: 700;
    color: ${C.navy};
    text-align: center;
    margin: 20px 0 14px 0;
`;

const Divider = styled.div`
    width: calc(100% - 40px);
    height: 2px;
    background: ${C.navy};
    flex-shrink: 0;
`;

const FieldsContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    width: calc(100% - 40px);
    padding: 12px 0 8px 0;

    @media screen and (max-width: 700px) {
        align-items: stretch;
    }
`;

const FieldRow = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 5px 10px;
    width: 100%;
    justify-content: flex-end;

    @media screen and (max-width: 700px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;

        input, select { width: 100%; flex-shrink: 1; }
    }
`;

const FieldLabel = styled.label`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(13px, 1.4vw, 20px);
    font-weight: 700;
    color: #000;
    white-space: nowrap;
    flex-shrink: 0;
`;

const FieldInput = styled.input`
    height: 30px;
    width: clamp(130px, 20vw, 300px);
    border: 2px solid #000;
    border-radius: 5px;
    background: ${C.white};
    padding: 4px 8px;
    font-size: 13px;
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    outline: none;
    flex-shrink: 0;
    box-sizing: border-box;

    &:focus {
        border-color: ${C.navy};
        box-shadow: 0 0 0 2px rgba(17,28,54,0.15);
    }
`;

const FieldSelect = styled.select`
    height: 30px;
    width: clamp(130px, 20vw, 300px);
    border: 2px solid #000;
    border-radius: 5px;
    background: ${C.white};
    padding: 4px 8px;
    font-size: 13px;
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    outline: none;
    flex-shrink: 0;
    box-sizing: border-box;
    cursor: pointer;

    &:focus {
        border-color: ${C.navy};
    }
`;

// ── Checkboxes ─────────────────────────────────────────────────────────────────

const CheckboxArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    width: calc(100% - 40px);
    padding: 8px 10px 4px 10px;
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
    flex-shrink: 0;
    cursor: pointer;
    accent-color: ${C.navy};
    border: 2px solid #000;
    border-radius: 4px;
`;

const CheckLabel = styled.label`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(11px, 1.1vw, 14px);
    font-weight: 700;
    color: #000;
    cursor: pointer;
    line-height: 1.3;
`;

// ── Submit ─────────────────────────────────────────────────────────────────────

const SubmitBtn = styled.button`
    height: clamp(54px, 6vw, 72px);
    width: calc(100% - 40px);
    background: ${C.red};
    border: 2px solid #000;
    border-radius: 5px;
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: clamp(18px, 2.2vw, 30px);
    font-weight: 700;
    color: ${C.white};
    cursor: pointer;
    margin-top: 4px;
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;

    &:hover:not(:disabled) {
        background: #8a1515;
        transform: translateY(-1px);
    }
    &:active {
        transform: translateY(0);
    }
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const Req = styled.span.attrs({ 'aria-hidden': true, children: '*' })`
    color: ${C.red};
    margin-left: 2px;
`;

export default function Register() {
    const navigate = useNavigate();

    const [rawValues, setFormValues] = useState<{ [key: string]: string | boolean }>({
        'first-name': '',
        'last-name': '',
        'rcsid': '',
        'rin': '',
        'major': '',
        'password': '',
        'confirm-password': '',
        'graduating': '',
        'bursar-acknowledgement': '',
    });

    const set = (key: string, value: string | boolean) =>
        setFormValues(prev => ({ ...prev, [key]: value }));

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
        const formValues = rawValues as { [key: string]: string };
        e.preventDefault();

        //Check RIN 9 digits, no characters, no special characters
        if (!/^\d{9}$/.test(formValues["rin"])) {
            alert("RIN must be 9 digits");
            return;
        }

        //Check RIN starts with 662
        if (!/^662\d{6}$/.test(formValues["rin"])) {
            alert("RIN must start with 662");
            return;
        }

        //Check if there is any special characters in RCSID
        if (/[^a-zA-Z0-9]/.test(formValues["rcsid"])) {
            alert("RCSID must not contain special characters");
            return;
        }

        //Check first/last name not empty 
        if (formValues["first-name"] === "" || formValues["last-name"] === "") {
            alert("First and last name cannot be empty");
            return;
        }

        //Check Password matches Confirm Password
        if (formValues["password"] !== formValues["confirm-password"]) {
            alert("Passwords do not match");
            return;
        }

        if (formValues["rcsid"].length > 8){
            alert("Invalid RCS ID");
            return;
        }

        //Check Password length
        if (formValues["password"].length < 5) {
            alert("Password must be at least 5 characters");
            return;
        }

        //Check if major is selected
        if (!formValues["major"] || formValues["major"] === "Select a major") {
            alert("Please select a major");
            return;
        }

        //Check if bursar acknowledgement is checked
        if (!formValues["bursar-acknowledgement"]) {
            alert("Please acknowledge the bursar charge");
            return;
        }

        setIsSubmitting(true);

        try {
            const signupData = {
                "RCSID": formValues["rcsid"],
                "RIN": formValues["rin"],
                "first_name": formValues["first-name"],
                "last_name": formValues["last-name"],
                "major": formValues["major"],
                "gender_identity": "notdisclosed",
                "pronouns": "not_shown",
                "password": formValues["password"],
                "is_graduating": formValues["graduating"] === "checked" ? true : false
            };

            const result = await OmniAPI.signup(signupData);
            console.log('Registration successful');
            alert('Registration successful: A verification email has been sent to your RPI email. (It may be in spam)');
            navigate('/login');
        } catch (error) {
            console.log('Registration unsuccessful');
            if (axios.isAxiosError(error) && error.status == 409) {
                alert('Registration failed: An account with this RCSID or RIN already exists.');
            } else {
                alert('Registration failed: ' + (error instanceof Error ? error.message : String(error)));
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <PageBackground>
            <AnvilImage src={ANVIL_URL} alt="" />
            <PageRuler src={RULER_URL} side="left" zIndex={1} />

            <FormCard>
                <CardInner>
                    <form onSubmit={handleRegister} style={{ width: '100%', display: 'contents' }}>
                        <Title>Registration Form</Title>
                        <Divider />

                        <FieldsContainer>
                            <FieldRow>
                                <FieldLabel htmlFor="first-name">First Name<Req /></FieldLabel>
                                <FieldInput id="first-name" type="text" value={rawValues['first-name'] as string}
                                    onChange={e => set('first-name', e.target.value)} required />
                            </FieldRow>
                            <FieldRow>
                                <FieldLabel htmlFor="last-name">Last Name<Req /></FieldLabel>
                                <FieldInput id="last-name" type="text" value={rawValues['last-name'] as string}
                                    onChange={e => set('last-name', e.target.value)} required />
                            </FieldRow>
                            <FieldRow>
                                <FieldLabel htmlFor="rcsid">RCS ID<Req /></FieldLabel>
                                <FieldInput id="rcsid" type="text" value={rawValues['rcsid'] as string}
                                    onChange={e => set('rcsid', e.target.value)} required />
                            </FieldRow>
                            <FieldRow>
                                <FieldLabel htmlFor="rin">RIN<Req /></FieldLabel>
                                <FieldInput id="rin" type="text" value={rawValues['rin'] as string}
                                    onChange={e => set('rin', e.target.value)} required />
                            </FieldRow>
                            <FieldRow>
                                <FieldLabel htmlFor="major">Major<Req /></FieldLabel>
                                <FieldSelect id="major" value={rawValues['major'] as string}
                                    onChange={e => set('major', e.target.value)} required>
                                    <option value="" disabled hidden>Select a major</option>
                                    {Majors.Majors.map((m: string) => <option key={m} value={m}>{m}</option>)}
                                </FieldSelect>
                            </FieldRow>
                            <FieldRow>
                                <FieldLabel htmlFor="password">Password<Req /></FieldLabel>
                                <FieldInput id="password" type="password" value={rawValues['password'] as string}
                                    onChange={e => set('password', e.target.value)} required />
                            </FieldRow>
                            <FieldRow>
                                <FieldLabel htmlFor="confirm-password">Confirm Password<Req /></FieldLabel>
                                <FieldInput id="confirm-password" type="password" value={rawValues['confirm-password'] as string}
                                    onChange={e => set('confirm-password', e.target.value)} required />
                            </FieldRow>
                        </FieldsContainer>

                        <Divider />

                        <CheckboxArea>
                            <CheckRow>
                                <StyledCheckbox id="graduating" type="checkbox"
                                    checked={rawValues['graduating'] === 'checked'}
                                    onChange={e => set('graduating', e.target.checked ? 'checked' : '')} />
                                <CheckLabel htmlFor="graduating">Are you graduating this semester?</CheckLabel>
                            </CheckRow>
                            <CheckRow>
                                <StyledCheckbox id="bursar-acknowledgement" type="checkbox"
                                    checked={rawValues['bursar-acknowledgement'] === 'checked'}
                                    onChange={e => set('bursar-acknowledgement', e.target.checked ? 'checked' : '')} />
                                <CheckLabel htmlFor="bursar-acknowledgement">
                                    A $20/semester membership fee applies if I submit a Machine Usage Form<Req />
                                </CheckLabel>
                            </CheckRow>
                        </CheckboxArea>


                        <SubmitBtn type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Creating Account...' : 'Start Making!'}
                        </SubmitBtn>

                    </form>
                </CardInner>
            </FormCard>
        </PageBackground>
    );
}
