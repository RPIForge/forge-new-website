import React from 'react';
import styled from 'styled-components';
import rulerIn1 from '../../assets/img/ruler-in-1.svg?url';
import rulerIn2 from '../../assets/img/ruler-in-2.svg?url';

const TILE_PITCH = 844.94;

const RULERS = {
    hero: { src: rulerIn1, width: 850, copies: 2 },
    bar: { src: rulerIn2, width: 737, copies: 1 },
} as const;

type Variant = keyof typeof RULERS;

const lengthOf = (v: Variant) => {
    const { width, copies } = RULERS[v];
    return width + (copies - 1) * TILE_PITCH;
};

const Holder = styled.div<{ $variant: Variant }>`
    position: absolute;
    width: 70px;
    height: ${p => lengthOf(p.$variant)}px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 4;

    ${p => p.$variant === 'hero'
        ? 'left: -3px; top: calc(50% - 7px); transform: translateY(-50%);'
        : 'left: -2px; bottom: -335px;'}

    @media (max-width: 768px) {
        display: none;
    }
`;

const Turned = styled.div<{ $length: number }>`
    position: relative;
    flex: none;
    width: ${p => p.$length}px;
    height: 70px;
    transform: rotate(-90deg) scaleY(-1);

    img {
        position: absolute;
        top: 0;
        height: 100%;
        max-width: none;
    }
`;

const Ruler: React.FC<{ variant: Variant }> = ({ variant }) => {
    const { src, width, copies } = RULERS[variant];
    return (
        <Holder $variant={variant} aria-hidden="true">
            <Turned $length={lengthOf(variant)}>
                {Array.from({ length: copies }, (_, i) => (
                    <img key={i} src={src} alt="" style={{ left: i * TILE_PITCH, width }} />
                ))}
            </Turned>
        </Holder>
    );
};

export default Ruler;
