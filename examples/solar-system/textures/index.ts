// Imported, so the bundler gives each a URL that works wherever the examples are served (the dev
// server, or the docs site under a sub-path). Same origin, so the canvas may draw them.
import earth from "./earth.svg";
import europa from "./europa.svg";
import io from "./io.svg";
import jupiter from "./jupiter.svg";
import mars from "./mars.svg";
import mercury from "./mercury.svg";
import moon from "./moon.svg";
import neptune from "./neptune.svg";
import saturn from "./saturn.svg";
import sun from "./sun.svg";
import titan from "./titan.svg";
import uranus from "./uranus.svg";
import venus from "./venus.svg";

export const FACE_URLS: Record<string, string> = { earth, europa, io, jupiter, mars, mercury, moon, neptune, saturn, sun, titan, uranus, venus };
