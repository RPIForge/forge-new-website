// Every machine symbol, imported so the bundler sees it.
//
// These used to be referenced as url(src/assets/img/symbols/${name}.svg),
// built from the machine's name at render time. Vite cannot see through an
// interpolated path, so it emitted none of these files and the bare `src/...`
// URL resolved against the page -- every symbol 404'd in a production build.
// In dev it looked fine only because the dev server answers a miss with
// index.html, so the background silently failed to paint instead of erroring.
//
// Importing each one gives the bundler something static to follow, and the
// values below are the hashed URLs it emits. A machine whose name matches no
// file gets no background rather than a failed request, which is what the
// dev database's placeholder machines ("qwe", "ewqeqw") hit.
//
// Adding a machine symbol means dropping the SVG in that folder and adding it
// here; the lookup is by file name, ignoring case and surrounding space.
//
// The ?url suffix is required: vite-plugin-svgr is configured over **/*.svg with
// exportType named, so a plain import of an SVG gives the React component and no
// default export at all. HeroBanner imports its SVGs the same way.

import Alpha from '../../assets/img/symbols/Alpha.svg?url';
import Beta from '../../assets/img/symbols/Beta.svg?url';
import Delta from '../../assets/img/symbols/Delta.svg?url';
import Epsilon from '../../assets/img/symbols/Epsilon.svg?url';
import Formlabs from '../../assets/img/symbols/Formlabs.svg?url';
import Gamma from '../../assets/img/symbols/Gamma.svg?url';
import Iota from '../../assets/img/symbols/Iota.svg?url';
import Lambda from '../../assets/img/symbols/Lambda.svg?url';
import Laser from '../../assets/img/symbols/Laser.svg?url';
import Markforged from '../../assets/img/symbols/Markforged.svg?url';
import Mu from '../../assets/img/symbols/Mu.svg?url';
import Omega from '../../assets/img/symbols/Omega.svg?url';
import Phi from '../../assets/img/symbols/Phi.svg?url';
import Prusa from '../../assets/img/symbols/Prusa.svg?url';
import Sigma from '../../assets/img/symbols/Sigma.svg?url';
import Sticker from '../../assets/img/symbols/Sticker.svg?url';
import Theta from '../../assets/img/symbols/Theta.svg?url';

const SYMBOLS: Record<string, string> = {
    alpha: Alpha,
    beta: Beta,
    delta: Delta,
    epsilon: Epsilon,
    formlabs: Formlabs,
    gamma: Gamma,
    iota: Iota,
    lambda: Lambda,
    laser: Laser,
    markforged: Markforged,
    mu: Mu,
    omega: Omega,
    phi: Phi,
    prusa: Prusa,
    sigma: Sigma,
    sticker: Sticker,
    theta: Theta,
};

/** The URL for a machine's symbol, or null when there is no symbol for it. */
export function machineSymbolUrl(name?: string): string | null {
    if (!name) return null;
    return SYMBOLS[name.trim().toLowerCase()] ?? null;
}

export default machineSymbolUrl;
