import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import bgPattern from '../../assets/img/background.svg?url';
import Ruler from './Ruler';

const Bar = styled.section`
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
    background-color: var(--color-white);
    border-top: 4px solid var(--color-red);
    border-right: 4px solid var(--color-red);
    box-sizing: border-box;
    min-height: 91px;
    display: flex;
    align-items: center;

    @media (max-width: 768px) {
        border-right: none;
    }
`;

const Pattern = styled.div`
    position: absolute;
    inset: 0;
    background-image: url("${bgPattern}");
    background-repeat: repeat;
    background-size: 122px 140px;
    opacity: 0.1;
    pointer-events: none;
`;

const Content = styled.div`
    position: relative;
    z-index: 1;
    width: 100%;
    display: flex;
    align-items: center;
    gap: clamp(16px, 4.8vw, 69px);
    padding: 12px clamp(24px, 5.6vw, 80px) 12px 100px;

    @media (max-width: 768px) {
        gap: 14px;
        padding: 12px 16px;
    }
`;

const Headline = styled.p`
    flex: 1 1 auto;
    margin: 0;
    font-family: 'Funnel Display', sans-serif;
    font-weight: 700;
    font-size: clamp(20px, 3.47vw, 50px);
    line-height: normal;
    color: var(--color-navy);
    text-align: center;
    text-wrap: balance;

    @media (min-width: 901px) {
        white-space: nowrap;
    }

    @media (max-width: 1439px) {
        font-size: 3.15vw;
    }

    @media (max-width: 900px) and (min-width: 769px) {
        font-size: 28px;
    }

    @media (max-width: 768px) {
        font-size: clamp(16px, 4.6vw, 24px);
        text-align: left;
    }
`;

const GetStarted = styled(Link)`
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: clamp(150px, 18.06vw, 260px);
    height: clamp(40px, 3.47vw, 50px);
    background-color: var(--color-red);
    border: 2px solid var(--color-navy);
    border-radius: 10px;
    color: var(--color-white);
    font-family: 'Funnel Display', sans-serif;
    font-weight: 600;
    font-size: clamp(18px, 2.08vw, 30px);
    line-height: normal;
    text-decoration: none;
    white-space: nowrap;
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

    @media (max-width: 768px) {
        width: auto;
        height: 44px;
        padding: 0 16px;
        font-size: clamp(16px, 4.6vw, 20px);
    }
`;

const MembershipBar: React.FC = () => (
    <Bar aria-label="Membership">
        <Pattern />
        <Ruler variant="bar" />
        <Content>
            <Headline>Membership is Only $20 Per Semester!</Headline>
            <GetStarted to="/register">Get Started</GetStarted>
        </Content>
    </Bar>
);

export default MembershipBar;
