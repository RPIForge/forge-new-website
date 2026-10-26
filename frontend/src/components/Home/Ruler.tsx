import React from 'react';
import styled from 'styled-components';
import rulerIn1 from '../../assets/img/ruler-in-1.svg?url';
import rulerIn2 from '../../assets/img/ruler-in-2.svg?url';

const RULERS = {
    hero: { src: rulerIn1, length: 850 },
    bar: { src: rulerIn2, length: 737 },
} as const;

type Variant = keyof typeof RULERS;

const Holder = styled.div<{ $variant: Variant }>`
    position: absolute;
    width: 70px;
    height: ${p => RULERS[p.$variant].length}px;
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
    flex: none;
    width: ${p => p.$length}px;
    height: 70px;
    transform: rotate(-90deg) scaleY(-1);

    img {
        display: block;
        width: 100%;
        height: 100%;
        max-width: none;
    }
`;

const Ruler: React.FC<{ variant: Variant }> = ({ variant }) => {
    const { src, length } = RULERS[variant];
    return (
        <Holder $variant={variant} aria-hidden="true">
            <Turned $length={length}>
                <img src={src} alt="" />
            </Turned>
        </Holder>
    );
};

export default Ruler;
