import React from 'react';
import styled from 'styled-components';
import HeroBanner from '../shared/HeroBanner';
import MembershipBar from './MembershipBar';
import Ruler from './Ruler';

const HERO_IMAGE = '/anvil_with_benchys_right.png';

const Page = styled.div`
    --nav-h: 65px;
    --bar-h: 91px;
    --hero-h: clamp(380px, min(57.4vw, calc(100svh - var(--nav-h) - var(--bar-h))), 826px);
    --hero-title-size: calc(var(--hero-h) * 0.1211);

    display: flex;
    flex-direction: column;

    @media (max-width: 1049px) {
        --nav-h: 56px;
    }

    @media (max-width: 900px) and (min-width: 769px) {
        --bar-h: 98px;
    }
`;

const Hero = styled(HeroBanner)`
    background: linear-gradient(to right, var(--color-navy-mid) 10.1%, var(--color-red) 100%);
    flex: 0 0 auto;
    min-height: var(--hero-h);

    @media (max-width: 768px) {
        min-height: 0;

        & > div:has(h1) {
            padding: clamp(24px, 6svh, 50px) 32px clamp(28px, 14svh, 180px);
        }
    }
`;

const Title = styled.h1`
    margin: 0;
    font-family: 'Funnel Display', sans-serif;
    font-weight: 700;
    font-size: var(--hero-title-size);
    line-height: 1.25;
    color: var(--color-white);

    span {
        display: block;
        white-space: pre;
    }

    @media (max-width: 768px) {
        font-size: clamp(36px, min(13vw, 8svh), 72px);
    }
`;

const Offerings = styled.ul`
    margin: calc(var(--hero-title-size) * 0.73) 0 0 calc(var(--hero-title-size) * 1.02);
    padding: 0;
    list-style: none;
    font-family: 'Funnel Display', sans-serif;
    font-weight: 700;
    font-size: calc(var(--hero-title-size) * 0.35);
    line-height: normal;
    color: var(--color-white);

    li {
        white-space: pre;
    }

    @media (max-width: 768px) {
        margin-left: clamp(24px, 10vw, 60px);
        margin-top: clamp(14px, 3svh, 28px);
        font-size: clamp(18px, min(5.6vw, 3.4svh), 28px);
    }
`;

export default function Home() {
    return (
        <Page>
            <Hero
                imageSrc={HERO_IMAGE}
                ruler={<Ruler variant="hero" />}
                title={
                    <>
                        <Title>
                            <span>Build.</span>
                            <span>{'  Create.'}</span>
                            <span>{'      Invent.'}</span>
                        </Title>
                        <Offerings aria-label="What you can make">
                            <li>3D Print</li>
                            <li>{'   Laser Cut'}</li>
                            <li>{'       Sticker Print'}</li>
                            <li>{'            and Much More!'}</li>
                        </Offerings>
                    </>
                }
            />
            <MembershipBar />
        </Page>
    );
}
