import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query from JS, so a component can leave an element out of
 * the DOM rather than hide it.
 *
 * This is not a substitute for the stylesheet: anything that can be hidden in
 * CSS should be. It exists for the one case CSS cannot cover -- a hidden
 * `<img>` is still downloaded. `display: none` stops a CSS background-image
 * from being fetched, but an `<img src>` is fetched whatever its box is doing,
 * so a large image meant for one screen size is pulled down on all of them.
 *
 * A query passed here duplicates a breakpoint in the styles; keep the two in
 * step, and prefer interpolating the same constant into both.
 */
export default function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const mql = window.matchMedia(query);
        // Re-read on mount: the viewport can change between the initial render
        // and this effect, and on a phone an orientation change will.
        setMatches(mql.matches);

        const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return matches;
}
