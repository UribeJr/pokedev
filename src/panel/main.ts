// This script will be run within the webview itself
import { randomName } from '../common/names';
import {
  PokemonSize,
  PokemonColor,
  PokemonType,
  Theme,
  ColorThemeKind,
  WebviewMessage,
} from '../common/types';
import { IPokemonType } from './states';
import {
  createPokemon,
  PokemonCollection,
  PokemonElement,
  IPokemonCollection,
  availableColors,
  InvalidPokemonException,
} from './pokemon-collection';
import { PokemonElementState, PokemonPanelState } from './states';
import { getRandomPokemonConfig } from '../common/pokemon-data';
import { reactionController } from './reaction-controller';
import { toastController } from './toast-controller';
import {
  getDisplaySkinById,
  PokedevDisplaySkin,
} from '../common/display-skins';
import { getEnvironmentById } from '../common/environments';
import {
  DEFAULT_ROAMING_STYLE,
  isValidRoamingStyle,
  RoamingStyle,
} from '../common/roaming-style';
import { calculateSpriteWidth } from './base-pokemon-type';
import {
  chooseInitialOverworldPosition,
  chooseOverworldY,
  rescaleForResize,
} from './roaming/overworld-target';
import {
  getRoamingStyle,
  isOverworldRoaming,
  setRoamingStyle,
} from './roaming/roaming-mode';
import { getWorldHeight, getWorldWidth } from './world-bounds';

/* This is how the VS Code API can be invoked from the panel */
declare global {
  interface VscodeStateApi {
    getState(): PokemonPanelState | undefined; // API is actually Any, but we want it to be typed.
    setState(state: PokemonPanelState): void;
    postMessage(message: WebviewMessage): void;
  }
  function acquireVsCodeApi(): VscodeStateApi;
}

export var allPokemon: IPokemonCollection = new PokemonCollection();
var pokemonCounter: number;

function normalizePokemonCounter(counter: number | undefined): number {
  if (counter === undefined || Number.isNaN(counter)) {
    return 0;
  }

  return Math.max(0, counter);
}

function calculateFloor(size: PokemonSize, theme: Theme): number {
  switch (theme) {
    case Theme.forest:
      switch (size) {
        case PokemonSize.small:
          return 30;
        case PokemonSize.medium:
          return 40;
        case PokemonSize.large:
          return 65;
        case PokemonSize.nano:
        default:
          return 23;
      }
    case Theme.castle:
      switch (size) {
        case PokemonSize.small:
          return 60;
        case PokemonSize.medium:
          return 80;
        case PokemonSize.large:
          return 120;
        case PokemonSize.nano:
        default:
          return 45;
      }
    case Theme.beach:
      switch (size) {
        case PokemonSize.small:
          return 60;
        case PokemonSize.medium:
          return 80;
        case PokemonSize.large:
          return 120;
        case PokemonSize.nano:
        default:
          return 45;
      }
  }
  return 0;
}

function handleMouseOver(e: MouseEvent) {
  var el = e.currentTarget as HTMLDivElement;
  allPokemon.pokemonCollection.forEach((element) => {
    if (element.collision === el) {
      if (!element.pokemon.canSwipe) {
        return;
      }
      element.pokemon.swipe();
    }
  });
}

function startAnimations(
  collision: HTMLDivElement,
  pokemon: IPokemonType,
  stateApi?: VscodeStateApi,
) {
  if (!stateApi) {
    stateApi = acquireVsCodeApi();
  }

  collision.addEventListener('mouseover', handleMouseOver);
  setInterval(() => {
    var updates = allPokemon.seekNewFriends();
    updates.forEach((message) => {
      stateApi?.postMessage({
        text: message,
        command: 'info',
      });
    });
    pokemon.nextFrame();
    reactionController.tick(pokemon, allPokemon);
    toastController.tick(pokemon, allPokemon);
    saveState(stateApi);
  }, 100);
}

function addPokemonToPanel(
  pokemonType: PokemonType,
  basePokemonUri: string,
  gen: string,
  originalSpriteSize: number,
  pokemonColor: PokemonColor,
  pokemonSize: PokemonSize,
  left: number,
  bottom: number,
  floor: number,
  name: string,
  stateApi?: VscodeStateApi,
  incrementCounter: boolean = true,
): PokemonElement {
  var pokemonSpriteElement: HTMLImageElement = document.createElement('img');
  pokemonSpriteElement.className = 'pokemon';
  (document.getElementById('pokemonContainer') as HTMLDivElement).appendChild(
    pokemonSpriteElement,
  );

  var collisionElement: HTMLDivElement = document.createElement('div');
  collisionElement.className = 'collision';
  (document.getElementById('pokemonContainer') as HTMLDivElement).appendChild(
    collisionElement,
  );

  var speechBubbleElement: HTMLImageElement = document.createElement('img');
  speechBubbleElement.className = `bubble bubble-${pokemonSize} b-${originalSpriteSize}`;
  speechBubbleElement.src = `${basePokemonUri}/heart.png`;
  (document.getElementById('pokemonContainer') as HTMLDivElement).appendChild(
    speechBubbleElement,
  );

  const root = `${basePokemonUri}/${gen}/${pokemonType}/${pokemonColor}`;
  console.log(
    'Creating new pokemon : ',
    pokemonType,
    root,
    pokemonColor,
    pokemonSize,
    name,
    originalSpriteSize,
  );
  try {
    if (!availableColors(pokemonType).includes(pokemonColor)) {
      throw new InvalidPokemonException('Invalid color for pokemon type');
    }
    var newPokemon = createPokemon(
      pokemonType,
      pokemonSpriteElement,
      collisionElement,
      speechBubbleElement,
      pokemonSize,
      left,
      bottom,
      root,
      floor,
      name,
      gen,
      originalSpriteSize,
    );
    if (incrementCounter) {
      pokemonCounter++;
    }
    startAnimations(collisionElement, newPokemon, stateApi);
  } catch (e: unknown) {
    // Remove elements
    pokemonSpriteElement.remove();
    collisionElement.remove();
    speechBubbleElement.remove();
    throw e;
  }

  pokemonSpriteElement.style.opacity = '0';

  const pokeballEl = document.createElement('div');
  pokeballEl.classList.add('pokeball-sprite');

  // Position pokeball at pokemon location + pokemon center offset
  pokeballEl.style.left = `${left}px`;
  pokeballEl.style.bottom = `${bottom}px`;

  (document.getElementById('pokemonContainer') as HTMLDivElement).appendChild(
    pokeballEl,
  );

  pokeballEl.offsetHeight;
  pokeballEl.classList.add('pokeball-open');

  // show pokemon earlier while pokeball animation is still running
  const computed = window.getComputedStyle(pokeballEl);
  const durationStr = (computed.animationDuration || '0s').split(',')[0].trim();
  const durationMs = durationStr.endsWith('ms')
    ? parseFloat(durationStr)
    : parseFloat(durationStr) * 1000;

  const spawnRatio = 0.7;
  const spawnDelay = Math.max(0, durationMs * spawnRatio);

  let spawned = false;
  const showPokemon = () => {
    if (spawned) {
      return;
    }
    spawned = true;
    pokemonSpriteElement.classList.add('spawn-pop');
    pokemonSpriteElement.style.opacity = '1';

    if (pokemonColor === PokemonColor.shiny) {
      const shinyOverlay = document.createElement('img');
      shinyOverlay.src = `${basePokemonUri}/shiny-anim.gif?t=${Date.now()}`;
      shinyOverlay.className = 'shiny-overlay';
      shinyOverlay.style.left = pokemonSpriteElement.style.left;
      shinyOverlay.style.bottom = pokemonSpriteElement.style.bottom;
      shinyOverlay.style.width = pokemonSpriteElement.style.width;
      shinyOverlay.style.height = pokemonSpriteElement.style.height;
      (
        document.getElementById('pokemonContainer') as HTMLDivElement
      ).appendChild(shinyOverlay);
      const removeOverlay = () => shinyOverlay.remove();
      shinyOverlay.addEventListener('animationend', removeOverlay);
      setTimeout(removeOverlay, 1500);
    }

    saveState(stateApi);
  };

  const spawnTimeout = setTimeout(showPokemon, spawnDelay);

  pokeballEl.addEventListener('animationend', (e) => {
    if (e.animationName !== 'pokeball-open') {
      return;
    }
    pokeballEl.remove();
    clearTimeout(spawnTimeout);
    showPokemon();
  });

  return new PokemonElement(
    pokemonSpriteElement,
    collisionElement,
    speechBubbleElement,
    newPokemon,
    pokemonColor,
    pokemonType,
    gen,
    originalSpriteSize,
  );
}

/**
 * Swaps a Pokemon to its evolved species in place.
 *
 * In place rather than remove-and-respawn: the Pokemon keeps its position, its
 * friend link and its animation state, so the change reads as a transformation
 * of the same creature rather than a substitution.
 *
 * Reuses the shiny spawn sparkle as the evolution effect. A dedicated
 * animation would be nicer, but correctness and persistence matter more here
 * than spectacle, and this asset and its cleanup already work.
 */
function evolvePokemonInPanel(
  message: {
    name: string;
    type: PokemonType;
    color: PokemonColor;
    generation: string;
    originalSpriteSize: number;
  },
  basePokemonUri: string,
  stateApi?: VscodeStateApi,
) {
  if (!stateApi) {
    return;
  }
  const element = allPokemon.locate(message.name);
  if (!element) {
    return;
  }

  element.evolveTo(
    message.type,
    message.color,
    message.generation,
    message.originalSpriteSize,
    basePokemonUri,
  );

  const overlay = document.createElement('img');
  overlay.src = `${basePokemonUri}/shiny-anim.gif?t=${Date.now()}`;
  overlay.className = 'shiny-overlay';
  overlay.style.left = element.el.style.left;
  overlay.style.bottom = element.el.style.bottom;
  overlay.style.width = element.el.style.width;
  overlay.style.height = element.el.style.height;
  (document.getElementById('pokemonContainer') as HTMLDivElement).appendChild(
    overlay,
  );
  const removeOverlay = () => overlay.remove();
  overlay.addEventListener('animationend', removeOverlay);
  setTimeout(removeOverlay, 1500);

  // A brief celebration, using the existing hold-state interrupt so the
  // Pokemon returns to whatever it was doing on its own.
  element.pokemon.showSpeechBubble(2000, false);

  saveState(stateApi);
}

function removePokemonFromPanel(
  message: { name: string },
  stateApi?: VscodeStateApi,
) {
  if (!stateApi) {
    stateApi = acquireVsCodeApi();
  }
  // Remove elements
  var pokemon = allPokemon.locate(message.name);

  if (!pokemon) {
    stateApi?.postMessage({
      command: 'error',
      text: `Could not find pokemon ${message.name}`,
    });
    return;
  }

  var pokemonSpriteElement = pokemon.el;
  console.log('Removing pokemon ', message.name);
  console.log('pokemon:', pokemon);

  // Remove from collection immediately so rapid deletes of Pokemon don't interfere with each other
  allPokemon.removeFromCollection(message.name);
  reactionController.forget(message.name);
  toastController.forget(message.name);
  pokemon.collision.remove();
  pokemon.speech.remove();
  pokemonCounter = normalizePokemonCounter(pokemonCounter - 1);
  saveState(stateApi);

  stateApi?.postMessage({
    command: 'info',
    text: '👋 Removed pokemon ' + message.name,
  });

  // pokemon fade out
  pokemonSpriteElement.classList.add('fade-out');

  const pokeballEl = document.createElement('div');
  pokeballEl.classList.add('pokeball-sprite');

  pokeballEl.style.left = `${pokemon.pokemon.left}px`;
  pokeballEl.style.bottom = `${pokemon.pokemon.bottom}px`;

  const container = document.getElementById(
    'pokemonContainer',
  ) as HTMLDivElement;
  container.appendChild(pokeballEl);

  pokeballEl.offsetHeight;
  pokeballEl.classList.add('pokeball-close');

  pokemonSpriteElement.addEventListener(
    'animationend',
    (e) => {
      if (e.animationName !== 'pokemon-fade-out') {
        return;
      }
      pokemonSpriteElement.remove();
    },
    { once: true },
  );

  pokeballEl.addEventListener(
    'animationend',
    (e) => {
      if (e.animationName !== 'pokeball-close') {
        return;
      }
      pokeballEl.remove();
    },
    { once: true },
  );
}

export function saveState(stateApi?: VscodeStateApi) {
  if (!stateApi) {
    stateApi = acquireVsCodeApi();
  }
  var state = new PokemonPanelState();
  state.pokemonStates = [];

  allPokemon.pokemonCollection.forEach((pokemonItem) => {
    state.pokemonStates?.push({
      pokemonName: pokemonItem.pokemon.name,
      pokemonColor: pokemonItem.color,
      pokemonType: pokemonItem.type,
      pokemonState: pokemonItem.pokemon.getState(),
      pokemonGeneration: pokemonItem.generation,
      originalSpriteSize: pokemonItem.originalSpriteSize,
      pokemonFriend: pokemonItem.pokemon.friend?.name ?? undefined,
      elLeft: pokemonItem.el.style.left,
      elBottom: pokemonItem.el.style.bottom,
    });
  });
  state.pokemonCounter = normalizePokemonCounter(pokemonCounter);
  stateApi?.setState(state);
}

function recoverState(
  basePokemonUri: string,
  gen: string,
  pokemonSize: PokemonSize,
  floor: number,
  stateApi?: VscodeStateApi,
) {
  if (!stateApi) {
    stateApi = acquireVsCodeApi();
  }
  var state = stateApi?.getState();
  if (!state) {
    pokemonCounter = 0;
  } else {
    pokemonCounter = normalizePokemonCounter(state.pokemonCounter);
  }

  var recoveryMap: Map<IPokemonType, PokemonElementState> = new Map();
  console.log(
    'recoverState: saved pokemon count =',
    state?.pokemonStates?.length ?? 0,
  );
  state?.pokemonStates?.forEach((p) => {
    console.log('Recovering pokemon ', p.pokemonType, p.pokemonName);
    try {
      console.log('Adding pokemon to panel for recovery');
      // Overworld mode: the last remembered 2D resting spot if this
      // Pokemon has one (see `PokemonInstanceState.overworldBottom`), else
      // a fresh Y - X is always the real, preserved position either way.
      // Classic mode is completely unchanged: `elBottom` as before.
      const initialBottom = isOverworldRoaming()
        ? (p.pokemonState?.overworldBottom ??
          chooseOverworldY(
            getWorldHeight(),
            calculateSpriteWidth(pokemonSize, p.originalSpriteSize ?? 32),
          ))
        : parseInt(p.elBottom ?? '0');
      var newPokemon = addPokemonToPanel(
        p.pokemonType ?? 'bulbasaur',
        basePokemonUri,
        p.pokemonGeneration ?? 'gen1',
        p.originalSpriteSize ?? 32,
        p.pokemonColor ?? PokemonColor.default,
        pokemonSize,
        parseInt(p.elLeft ?? '0'),
        initialBottom,
        floor,
        p.pokemonName ?? randomName(),
        stateApi,
        false,
      );
      allPokemon.push(newPokemon);
      recoveryMap.set(newPokemon.pokemon, p);
    } catch (InvalidPokemonException) {
      console.log(
        'State had invalid pokemon (' + p.pokemonType + '), discarding.',
      );
    }
  });
  recoveryMap.forEach((state, pokemon) => {
    // Recover previous state.
    if (state.pokemonState !== undefined) {
      pokemon.recoverState(state.pokemonState);
    }

    // Resolve friend relationships
    var friend = undefined;
    if (state.pokemonFriend) {
      friend = allPokemon.locate(state.pokemonFriend);
      if (friend) {
        pokemon.recoverFriend(friend.pokemon);
      }
    }
  });
}

function randomStartPosition(): number {
  return Math.floor(Math.random() * (getWorldWidth() * 0.7));
}

/**
 * Where a newly-spawned Pokemon should appear. Classic mode is completely
 * unchanged (`randomStartPosition()` + the floor); Overworld mode picks a
 * full 2D spot with the same lightweight separation-avoidance initial
 * placement uses, checked against every Pokemon already visible.
 */
function chooseSpawnPosition(
  spriteSize: number,
  floor: number,
): { x: number; y: number } {
  if (!isOverworldRoaming()) {
    return { x: randomStartPosition(), y: floor };
  }
  const others = allPokemon.pokemonCollection.map((p) => ({
    x: p.pokemon.left,
    y: p.pokemon.bottom,
  }));
  return chooseInitialOverworldPosition(
    getWorldWidth(),
    getWorldHeight(),
    spriteSize,
    others,
  );
}

let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D;

function initCanvas() {
  canvas = document.getElementById('pokemonCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.log('Canvas not ready');
    return;
  }
  ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (!ctx) {
    console.log('Canvas context not ready');
    return;
  }
  ctx.canvas.width = getWorldWidth();
  ctx.canvas.height = getWorldHeight();
}

/**
 * The currently applied display skin. Defaults to `none` (full-viewport
 * screen, no overlay) until `applyDisplaySkin` runs during bootstrap.
 */
let currentDisplaySkin: PokedevDisplaySkin = getDisplaySkinById(undefined);

/**
 * Letterboxes `.pokedev-display` to the current skin's aspect ratio inside
 * whatever size the Explorer sidebar currently is, then re-sizes the ball
 * canvas to match. For the `none` skin the ratio is always set to the
 * viewport's own ratio, so the computed size is exactly the viewport - pixel
 * identical to this view's appearance before display skins existed.
 */
function layoutDisplay(): void {
  const displayEl = document.getElementById('pokedevDisplay');
  if (!displayEl) {
    return;
  }
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const ratio = currentDisplaySkin.imageFile
    ? currentDisplaySkin.sourceWidth / currentDisplaySkin.sourceHeight
    : viewportWidth / Math.max(viewportHeight, 1);

  let width = viewportWidth;
  let height = width / ratio;
  if (height > viewportHeight) {
    height = viewportHeight;
    width = height * ratio;
  }

  displayEl.style.width = `${Math.round(width)}px`;
  displayEl.style.height = `${Math.round(height)}px`;

  initCanvas();
}

/**
 * Applies a display skin by id: shows/hides the bezel overlay image, insets
 * `.pokedev-screen` to the skin's normalized screen rectangle, and
 * re-letterboxes. Never touches `allPokemon`/webview state - purely
 * presentational, safe to call any number of times.
 */
function applyDisplaySkin(basePokemonUri: string, skinId: string): void {
  const skin = getDisplaySkinById(skinId);
  currentDisplaySkin = skin;

  const overlayEl = document.getElementById(
    'pokedevOverlay',
  ) as HTMLImageElement | null;
  if (overlayEl) {
    if (skin.imageFile) {
      overlayEl.src = `${basePokemonUri}/${skin.imageFile}`;
      overlayEl.style.display = 'block';
    } else {
      overlayEl.removeAttribute('src');
      overlayEl.style.display = 'none';
    }
  }

  const screenEl = document.getElementById('pokedevScreen');
  if (screenEl) {
    screenEl.style.left = `${skin.screen.x * 100}%`;
    screenEl.style.top = `${skin.screen.y * 100}%`;
    screenEl.style.width = `${skin.screen.width * 100}%`;
    screenEl.style.height = `${skin.screen.height * 100}%`;
  }

  layoutDisplay();
}

/**
 * Applies a background environment scene by id: shows/hides the
 * `#pokedevEnvironment` image. Entirely independent of `applyDisplaySkin`
 * above - the environment is a plain background layer behind the Pokemon,
 * the display skin is the bezel overlay above everything - so this never
 * touches `.pokedev-screen`'s geometry or re-letterboxes anything. Never
 * touches `allPokemon`/webview state either; purely presentational, safe to
 * call any number of times.
 */
function applyEnvironment(basePokemonUri: string, environmentId: string): void {
  const environment = getEnvironmentById(environmentId);

  const environmentEl = document.getElementById(
    'pokedevEnvironment',
  ) as HTMLImageElement | null;
  if (!environmentEl) {
    return;
  }
  if (environment.imageFile) {
    environmentEl.src = `${basePokemonUri}/${environment.imageFile}`;
    environmentEl.style.display = 'block';
  } else {
    environmentEl.removeAttribute('src');
    environmentEl.style.display = 'none';
  }
}

/**
 * Live-switches roaming strategy: never reloads the webview, never resets
 * `allPokemon`/XP/Friendship/anything else - it only ever repositions
 * `bottom` (X is shared between both modes already) and lets whichever walk
 * state is currently in flight finish naturally, exactly like
 * `applyDisplaySkin`/`applyEnvironment` for their own cosmetic state.
 *
 * Classic -> Overworld: restores each Pokemon's last remembered Overworld
 * spot (`overworldBottom`) if it has one, else generates a fresh Y -
 * X is untouched either way ("preserve X where practical").
 *
 * Overworld -> Classic: projects each Pokemon back onto its own floor.
 * Nothing about `overworldBottom` is deleted - `positionBottom` only
 * updates it while Overworld mode is the ACTIVE mode (see
 * `BasePokemonType.positionBottom`), so switching back to Overworld later
 * restores this exact spot.
 */
function applyRoamingStyle(newStyle: RoamingStyle): void {
  const previous = getRoamingStyle();
  if (previous === newStyle) {
    return;
  }

  if (newStyle === 'classic') {
    // Set the mode FIRST: `positionBottom` only treats a write as "the
    // current Overworld position" while Overworld is still the active
    // mode, so this order is what keeps the last Overworld spot intact
    // instead of overwriting it with the floor projection below.
    setRoamingStyle('classic');
    allPokemon.pokemonCollection.forEach((p) => {
      p.pokemon.positionBottom(p.pokemon.floor);
    });
    return;
  }

  setRoamingStyle('overworld');
  allPokemon.pokemonCollection.forEach((p) => {
    const y =
      p.pokemon.overworldBottom ??
      chooseOverworldY(getWorldHeight(), p.pokemon.width);
    p.pokemon.positionBottom(y);
  });
}

// It cannot access the main VS Code APIs directly.
export function pokemonPanelApp(
  basePokemonUri: string,
  theme: Theme,
  themeKind: ColorThemeKind,
  pokemonColor: PokemonColor,
  pokemonSize: PokemonSize,
  pokemonType: PokemonType,
  throwBallWithMouse: boolean,
  gen: string,
  originalSpriteSize: number,
  displaySkinId?: string,
  environmentId?: string,
  roamingStyleId?: string,
  stateApi?: VscodeStateApi,
) {
  var floor = 0;
  if (!stateApi) {
    stateApi = acquireVsCodeApi();
  }

  // Set before anything below constructs/recovers a single Pokemon:
  // `resolveState` (which strategy's states get built) and `positionBottom`
  // (depth z-index) both read this synchronously, with no message round
  // trip - so the very first frame already uses the right strategy instead
  // of one frame of the wrong one.
  setRoamingStyle(
    isValidRoamingStyle(roamingStyleId)
      ? roamingStyleId
      : DEFAULT_ROAMING_STYLE,
  );

  // Sizes `.pokedev-display`/`.pokedev-screen` before anything below reads
  // `getWorldWidth()`/`getWorldHeight()` (recovered/spawned Pokemon states
  // included), so the very first frame already respects the selected skin's
  // screen opening instead of the full viewport.
  applyDisplaySkin(basePokemonUri, displaySkinId ?? 'none');
  applyEnvironment(basePokemonUri, environmentId ?? 'none');

  // Apply Theme backgrounds
  const foregroundEl = document.getElementById('foreground');
  if (theme !== Theme.none) {
    var _themeKind = '';
    switch (themeKind) {
      case ColorThemeKind.dark:
        _themeKind = 'dark';
        break;
      case ColorThemeKind.light:
        _themeKind = 'light';
        break;
      case ColorThemeKind.highContrast:
      default:
        _themeKind = 'light';
        break;
    }

    document.body.style.backgroundImage = `url('${basePokemonUri}/backgrounds/${theme}/background-${_themeKind}-${pokemonSize}.png')`;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    foregroundEl!.style.backgroundImage = `url('${basePokemonUri}/backgrounds/${theme}/foreground-${_themeKind}-${pokemonSize}.png')`;

    floor = calculateFloor(pokemonSize, theme); // Themes have pokemonCollection at a specified height from the ground
  } else {
    document.body.style.backgroundImage = '';
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    foregroundEl!.style.backgroundImage = '';
  }

  console.log(
    'Starting pokemon session',
    pokemonColor,
    basePokemonUri,
    pokemonType,
    throwBallWithMouse,
  );

  // New session
  var state = stateApi?.getState();

  const hasRecoverableState =
    state !== undefined &&
    Array.isArray(state.pokemonStates) &&
    state.pokemonStates.length > 0;

  if (hasRecoverableState) {
    console.log('Recovering state - ', state);
    recoverState(basePokemonUri, gen, pokemonSize, floor, stateApi);
  } else {
    console.log('No recoverable pokemon state, starting an empty session.');
    pokemonCounter = normalizePokemonCounter(state?.pokemonCounter);
    saveState(stateApi);
  }

  // This webview's OWN persisted state (separate from the extension's saved
  // Pokemon collection - see `saveState`) is not the same thing as the
  // user's real collection, and can drift behind it: an extension update or
  // a cleared webview state resets the former but never the latter, and a
  // Pokemon spawned or evolved while a DIFFERENT window's copy of this same
  // view was the open one never reaches this one at all, since this state is
  // per-webview, not shared. Sent unconditionally, whether or not there was
  // anything to recover above, carrying whatever this webview currently has
  // so the host only ever fills in what is actually missing rather than
  // risking a visual duplicate of a Pokemon already restored.
  stateApi?.postMessage({
    command: 'request-canonical-collection',
    text: allPokemon.pokemonCollection.map((p) => p.pokemon.name).join('\n'),
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', (event): void => {
    const message = event.data; // The json data that the extension sent
    console.log('Received message in panel:', message);
    switch (message.command) {
      case 'spawn-pokemon': {
        console.log('adding pokemon to panel from message', message);
        const spawnAt = chooseSpawnPosition(
          calculateSpriteWidth(pokemonSize, message.originalSpriteSize),
          floor,
        );
        allPokemon.push(
          addPokemonToPanel(
            message.type,
            basePokemonUri,
            message.generation,
            message.originalSpriteSize,
            message.color,
            pokemonSize,
            spawnAt.x,
            spawnAt.y,
            floor,
            message.name ?? randomName(),
            stateApi,
          ),
        );
        saveState(stateApi);
        break;
      }

      case 'spawn-random-pokemon': {
        var [randomPokemonType, randomPokemonConfig] = getRandomPokemonConfig();
        console.log('adding random pokemon to panel from message');
        const spawnAt = chooseSpawnPosition(
          calculateSpriteWidth(
            pokemonSize,
            randomPokemonConfig.originalSpriteSize ?? 32,
          ),
          floor,
        );
        allPokemon.push(
          addPokemonToPanel(
            randomPokemonType,
            basePokemonUri,
            randomPokemonConfig.generation.toString(),
            randomPokemonConfig.originalSpriteSize ?? 32,
            PokemonColor.default,
            pokemonSize,
            spawnAt.x,
            spawnAt.y,
            floor,
            randomName(),
            stateApi,
          ),
        );
        saveState(stateApi);
        break;
      }

      case 'list-pokemon':
        var pokemonCollection = allPokemon.pokemonCollection;
        stateApi?.postMessage({
          command: 'list-pokemon',
          text: pokemonCollection
            .map(
              (pokemon) =>
                `${pokemon.type},${pokemon.pokemon.name},${pokemon.color}`,
            )
            .join('\n'),
        });
        break;

      case 'roll-call':
        var pokemonCollection = allPokemon.pokemonCollection;
        // go through every single
        // pokemon and then print out their name
        pokemonCollection.forEach((pokemon) => {
          stateApi?.postMessage({
            command: 'info',
            text: `${pokemon.pokemon.emoji} ${pokemon.pokemon.name} (${pokemon.color} ${pokemon.type}): ${pokemon.pokemon.hello}`,
          });
        });
        break;
      case 'delete-pokemon':
        removePokemonFromPanel(message, stateApi);
        break;
      case 'evolve-pokemon':
        evolvePokemonInPanel(message, basePokemonUri, stateApi);
        break;
      case 'pokemon-reaction':
        reactionController.handleMessage(message, allPokemon);
        break;
      case 'pokemon-toast':
        toastController.handleMessage(message, allPokemon);
        break;
      case 'reset-pokemon':
        var pokemonToRemove = [...allPokemon.pokemonCollection];
        pokemonToRemove.forEach((pokemon) => {
          removePokemonFromPanel({ name: pokemon.pokemon.name }, stateApi);
        });
        // Wait for animations to complete before resetting
        setTimeout(() => {
          allPokemon.reset();
          pokemonCounter = 0;
          saveState(stateApi);
        }, 500);
        break;
      case 'pause-pokemon':
        pokemonCounter = 1;
        saveState(stateApi);
        break;
      case 'set-display-skin':
        applyDisplaySkin(basePokemonUri, message.text);
        break;
      case 'set-environment':
        applyEnvironment(basePokemonUri, message.text);
        break;
      case 'set-roaming-style':
        if (isValidRoamingStyle(message.text)) {
          applyRoamingStyle(message.text);
        }
        break;
    }
  });
}
window.addEventListener('resize', function () {
  const oldWidth = getWorldWidth();
  const oldHeight = getWorldHeight();
  layoutDisplay();

  // Overworld positions are proportional, not fixed pixels - rescale every
  // Pokemon's spot to the new screen size so nothing jumps to a corner (or
  // off-screen) on a resize. Classic mode needs no such pass: it already
  // only ever cares about `left` relative to the current `getWorldWidth()`,
  // recomputed fresh the next time a walk state starts.
  if (isOverworldRoaming()) {
    const newWidth = getWorldWidth();
    const newHeight = getWorldHeight();
    if (newWidth !== oldWidth || newHeight !== oldHeight) {
      allPokemon.pokemonCollection.forEach((p) => {
        p.pokemon.positionLeft(
          rescaleForResize(p.pokemon.left, oldWidth, newWidth),
        );
        p.pokemon.positionBottom(
          rescaleForResize(p.pokemon.bottom, oldHeight, newHeight),
        );
      });
    }
  }
});
