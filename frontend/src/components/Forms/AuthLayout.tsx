import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import anvilImg from '../../assets/img/anvil_with_benchys.png';
import dividerLine from '../../assets/img/auth-divider.svg?url';
import Ruler from '../Home/Ruler';

const Page = styled.div`
    position: relative;
    flex: 1 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: min(868px, calc(100svh - 72px));
    padding: 42px clamp(16px, 3.6vw, 52px);
    overflow: hidden;
    background: linear-gradient(to left, var(--color-navy-mid) 10.096%, var(--color-red) 100%);

    @media (max-width: 1099px) {
        justify-content: center;
    }

    @media (max-width: 600px) {
        padding: 24px 16px 32px;
    }
`;

const Anvil = styled.div`
    position: absolute;
    top: 10px;
    bottom: 42px;
    left: 4.65%;
    width: 96.4%;
    overflow: hidden;
    pointer-events: none;

    img {
        position: absolute;
        top: 0;
        left: -4.49%;
        height: 100%;
        width: auto;
        max-width: none;
    }

    @media (max-width: 1099px) {
        top: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        opacity: 0.35;

        img {
            top: 50%;
            left: 0;
            width: 100%;
            height: auto;
            transform: translateY(-50%);
        }
    }

    @media (max-width: 600px) {
        bottom: auto;
        height: 320px;
        opacity: 0.3;

        img {
            top: 0;
            left: -25%;
            width: 160%;
            transform: none;
        }
    }
`;

const Card = styled.div<{ $wide?: boolean }>`
    position: relative;
    z-index: 5;
    box-sizing: border-box;
    width: ${p => (p.$wide ? '540px' : '460px')};
    max-width: 100%;
    background-color: var(--color-white);
    border: 4px solid var(--color-navy);
    border-radius: 10px;
    overflow: hidden;
    color: var(--color-black);
    font-family: 'Funnel Display', sans-serif;

    form {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        width: 100% !important;
        padding: 26px 28px 24px;
        gap: 0;
        background: none;
        box-shadow: none;
        border-radius: 0;
    }

    @media (max-width: 600px) {
        form {
            padding: 22px 16px 18px;
        }
    }

    // The sign-in card has fewer fields, so it gets a little more room than Register
    ${p => !p.$wide && `
        && form {
            padding: 34px 32px 30px;
        }

        && h1 {
            font-size: 30px;
        }

        && form > div {
            gap: 18px;
        }

        && label {
            font-size: 16px;
        }

        && input {
            height: 42px;
        }

        && button[type="submit"] {
            height: 48px;
            font-size: 20px;
        }

        && p {
            font-size: 16px;
        }

        && img {
            margin-top: 18px;
            margin-bottom: 16px;
        }
    `}
`;

export const AuthTitle = styled.h1`
    margin: 0;
    font-family: 'Funnel Display', sans-serif;
    font-weight: 700;
    font-size: 26px;
    line-height: normal;
    color: var(--color-navy);
    text-align: center;

    @media (max-width: 600px) {
        font-size: 24px;
    }
`;

const DividerImg = styled.img<{ $gap?: string }>`
    display: block;
    width: 100%;
    height: 4px;
    margin: ${p => p.$gap ?? '14px 0 10px'};
`;

export const AuthDivider: React.FC<{ gap?: string }> = ({ gap }) => (
    <DividerImg src={dividerLine} alt="" aria-hidden="true" $gap={gap} />
);

// Label above input; pass $columns={2} to put short fields side by side
export const AuthFields = styled.div<{ $columns?: number }>`
    display: grid;
    grid-template-columns: ${p => (p.$columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)')};
    gap: 12px 16px;
    padding: 4px 0;

    @media (max-width: 600px) {
        grid-template-columns: minmax(0, 1fr);
    }
`;

export const AuthField = styled.div<{ $full?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    grid-column: ${p => (p.$full ? '1 / -1' : 'auto')};

    label {
        font-weight: 700;
        font-size: 15px;
        line-height: normal;
        color: var(--color-black);
    }

    input,
    select {
        box-sizing: border-box;
        width: 100%;
        height: 36px;
        padding: 0 10px;
        background-color: var(--color-white);
        border: 2px solid var(--color-black);
        border-radius: 5px;
        font-family: 'Funnel Display', sans-serif;
        font-size: 16px;
        color: var(--color-black);

        &:focus-visible {
            outline: 3px solid var(--color-navy-mid);
            outline-offset: 1px;
        }
    }
`;

export const AuthRequired = styled.span.attrs({ 'aria-hidden': true, children: '*' })`
    color: var(--color-red);
    margin-left: 2px;
`;

export const AuthChecks = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 12px;
`;

export const AuthCheck = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;

    input {
        appearance: none;
        flex: 0 0 auto;
        width: 22px;
        height: 22px;
        margin: 0;
        background-color: var(--color-white);
        border: 2px solid var(--color-black);
        border-radius: 5px;
        cursor: pointer;

        &:checked {
            background-color: var(--color-red);
            box-shadow: inset 0 0 0 3px var(--color-white);
        }

        &:focus-visible {
            outline: 3px solid var(--color-navy-mid);
            outline-offset: 1px;
        }
    }

    label {
        font-weight: 600;
        font-size: 14px;
        line-height: 1.35;
        cursor: pointer;
    }
`;

export const AuthPrimaryButton = styled.button`
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 180px;
    height: 44px;
    padding: 0 24px;
    background-color: var(--color-red);
    border: 2px solid var(--color-black);
    border-radius: 5px;
    color: var(--color-white);
    font-family: 'Funnel Display', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: normal;
    white-space: nowrap;
    cursor: pointer;
    transition: filter 150ms ease, transform 150ms ease;

    &:hover {
        filter: brightness(1.1);
    }

    &:active {
        transform: translateY(1px);
    }

    &:focus-visible {
        outline: 3px solid var(--color-navy-mid);
        outline-offset: 2px;
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        filter: none;
    }

    @media (max-width: 600px) {
        width: 100%;
    }
`;

export const AuthButtonRow = styled.div`
    display: flex;
    justify-content: center;
    margin-top: 16px;
`;

// Small red text link, e.g. "Forgot password?" and "Register here"
export const AuthLink = styled(Link)<{ $end?: boolean }>`
    align-self: ${p => (p.$end ? 'flex-end' : 'auto')};
    margin-top: ${p => (p.$end ? '6px' : '0')};
    color: var(--color-red);
    font-weight: 700;
    font-size: 14px;
    text-decoration: none;
    border-radius: 3px;

    &:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
    }

    &:focus-visible {
        outline: 2px solid var(--color-navy-mid);
        outline-offset: 2px;
    }
`;

export const AuthPrompt = styled.p`
    margin: 0;
    font-weight: 500;
    font-size: 15px;
    line-height: 1.4;
    text-align: center;
    color: var(--color-black);

    a {
        font-size: inherit;
    }
`;

const AuthLayout: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
    <Page>
        <Anvil aria-hidden="true">
            <img src={anvilImg} alt="" />
        </Anvil>
        <Ruler variant="hero" />
        <Card $wide={wide}>{children}</Card>
    </Page>
);

export default AuthLayout;
