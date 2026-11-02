import React from 'react';
import { Link } from 'react-router-dom';
import styled, { css } from 'styled-components';
import anvilImg from '../../assets/img/anvil_with_benchys.png';
import bgPattern from '../../assets/img/background.svg?url';
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
        align-items: flex-start;
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

const Card = styled.div`
    position: relative;
    z-index: 5;
    width: 552px;
    max-width: 100%;
    background-color: var(--color-white);
    border: 4px solid var(--color-navy);
    border-radius: 10px;
    overflow: hidden;
    color: var(--color-black);
    font-family: 'Funnel Display', sans-serif;

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: url("${bgPattern}");
        background-repeat: repeat;
        background-size: 122px 140px;
        opacity: 0.1;
        pointer-events: none;
    }

    form {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100% !important;
        padding: 34px 17px 17px;
        gap: 0;
        background: none;
        box-shadow: none;
        border-radius: 0;
    }

    @media (max-width: 600px) {
        form {
            padding: 24px 14px 16px;
        }
    }
`;

export const AuthTitle = styled.h1`
    margin: 0;
    font-family: 'Funnel Display', sans-serif;
    font-weight: 700;
    font-size: 30px;
    line-height: normal;
    color: var(--color-navy);
    text-align: center;

    @media (max-width: 600px) {
        font-size: 26px;
    }
`;

const DividerImg = styled.img<{ $gap?: string }>`
    display: block;
    width: min(510px, 100%);
    height: 4px;
    margin: ${p => p.$gap ?? '18px 0 14px'};
`;

export const AuthDivider: React.FC<{ gap?: string }> = ({ gap }) => (
    <DividerImg src={dividerLine} alt="" aria-hidden="true" $gap={gap} />
);

export const AuthFields = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    width: min(520px, 100%);
    padding: 10px 0;
`;

const controlStyles = css`
    box-sizing: border-box;
    width: 300px;
    height: 25px;
    padding: 0 8px;
    background-color: var(--color-white);
    border: 2px solid var(--color-black);
    border-radius: 5px;
    font-family: 'Funnel Display', sans-serif;
    font-size: 15px;
    color: var(--color-black);

    &:focus-visible {
        outline: 3px solid var(--color-navy-mid);
        outline-offset: 1px;
    }

    @media (max-width: 600px) {
        width: 100%;
        height: 38px;
        font-size: 16px;
    }
`;

export const AuthField = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px;

    label {
        font-weight: 700;
        font-size: 20px;
        line-height: normal;
        white-space: nowrap;
        color: var(--color-black);
    }

    input,
    select {
        ${controlStyles}
    }

    @media (max-width: 600px) {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        padding: 4px 0;

        label {
            font-size: 18px;
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
    width: min(509px, 100%);
    margin-top: 10px;
`;

export const AuthCheck = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px;

    & + & {
        min-height: 70px;
    }

    input {
        appearance: none;
        flex: 0 0 auto;
        width: 25px;
        height: 25px;
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
        font-weight: 700;
        font-size: 15px;
        line-height: normal;
        cursor: pointer;
    }

    @media (max-width: 600px) {
        gap: 12px;
        padding: 8px 0;

        & + & {
            min-height: 0;
        }
    }
`;

const buttonStyles = css`
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-red);
    border: 2px solid var(--color-black);
    border-radius: 5px;
    color: var(--color-white);
    font-family: 'Funnel Display', sans-serif;
    font-weight: 700;
    line-height: normal;
    text-align: center;
    text-decoration: none;
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
`;

export const AuthPrimaryButton = styled.button<{ $wide?: boolean }>`
    ${buttonStyles}
    width: ${p => (p.$wide ? 'min(500px, 100%)' : '200px')};
    height: ${p => (p.$wide ? '80px' : '50px')};
    font-size: ${p => (p.$wide ? '30px' : '20px')};
    margin-top: ${p => (p.$wide ? '28px' : '0')};

    @media (max-width: 600px) {
        width: 100%;
        height: ${p => (p.$wide ? '60px' : '48px')};
        font-size: ${p => (p.$wide ? '24px' : '20px')};
        margin-top: ${p => (p.$wide ? '16px' : '0')};
    }
`;

export const AuthSmallButton = styled(Link)`
    ${buttonStyles}
    width: 200px;
    height: 50px;
    font-size: 20px;

    @media (max-width: 600px) {
        width: 100%;
        height: 48px;
    }
`;

export const AuthWideLink = styled(Link)`
    ${buttonStyles}
    width: min(461px, 100%);
    height: 50px;
    font-size: 30px;

    @media (max-width: 600px) {
        font-size: 24px;
    }
`;

export const AuthButtonRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    margin-top: 15px;

    @media (max-width: 600px) {
        width: 100%;
        flex-direction: column;
        gap: 14px;
    }
`;

export const AuthPrompt = styled.p`
    margin: 0 0 32px;
    font-weight: 700;
    font-size: 30px;
    line-height: normal;
    text-align: center;
    color: var(--color-black);

    @media (max-width: 600px) {
        font-size: 22px;
        margin-bottom: 16px;
    }
`;

const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Page>
        <Anvil aria-hidden="true">
            <img src={anvilImg} alt="" />
        </Anvil>
        <Ruler variant="hero" />
        <Card>{children}</Card>
    </Page>
);

export default AuthLayout;
