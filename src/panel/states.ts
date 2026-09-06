import { PokemonColor, PokemonType } from '../common/types';
import { chooseOverworldTarget } from './roaming/overworld-target';
import { isOverworldRoaming } from './roaming/roaming-mode';
import { getWorldHeight, getWorldWidth } from './world-bounds';

export interface IPokemonType {
  nextFrame(): void;

  // Special methods for actions
  canSwipe: boolean;
  canChase: boolean;
  swipe(): void;
  chase(ballState: BallState, canvas: HTMLCanvasElement): void;
  speed: number;
  isMoving: boolean;
  hello: string;

  // State API
  getState(): PokemonInstanceState;
  recoverState(state: PokemonInstanceState): void;
  recoverFriend(friend: IPokemonType): void;

  // Positioning
  bottom: number;
  left: number;
  positionBottom(bottom: number): void;
  positionLeft(left: number): void;
  width: number;
  floor: number;
  /** The last Overworld (2D) resting `bottom`, independent of whatever
   * Classic mode currently has `bottom` set to - see
   * `PokemonInstanceState.overworldBottom`'s doc comment. */
  overworldBottom: number | undefined;

  // Friends API
  name: string;
  emoji: string;
  hasFriend: boolean;
  friend: IPokemonType | undefined;
  makeFriendsWith(friend: IPokemonType): boolean;
  isPlaying: boolean;

  showSpeechBubble(duration: number, friend: boolean): void;

  /** Repoints this Pokemon at an evolved species, preserving everything else. */
  evolveTo(
    pokemonType: PokemonType,
    pokemonRoot: string,
    generation: string,
    originalSpriteSize: number,
  ): void;
}

export class PokemonInstanceState {
  currentStateEnum: States | undefined;
  /**
   * The last Overworld (2D) resting `bottom`, remembered independently of
   * whatever `elBottom`/`floor` Classic mode is currently using - see
   * `BasePokemonType`'s `_overworldBottom`. Undefined for a Pokemon that has
   * never been in Overworld mode; on a Classic -> Overworld switch (or a
   * reload while Overworld is active) with no remembered value, a fresh
   * position is generated instead of defaulting to the floor.
   */
  overworldBottom: number | undefined;
}

export class PokemonElementState {
  pokemonState: PokemonInstanceState | undefined;
  pokemonGeneration: string | undefined;
  originalSpriteSize: number | undefined;
  pokemonType: PokemonType | undefined;
  pokemonColor: PokemonColor | undefined;
  elLeft: string | undefined;
  elBottom: string | undefined;
  pokemonName: string | undefined;
  pokemonFriend: string | undefined;
}

export class PokemonPanelState {
  pokemonStates: Array<PokemonElementState> | undefined;
  pokemonCounter: number | undefined;
}

export enum HorizontalDirection {
  left,
  right,
  natural, // No change to current direction
}

export const enum States {
  sitIdle = 'sit-idle',
  walkRight = 'walk-right',
  walkLeft = 'walk-left',
  runRight = 'run-right',
  runLeft = 'run-left',
  lie = 'lie',
  wallHangLeft = 'wall-hang-left',
  climbWallLeft = 'climb-wall-left',
  jumpDownLeft = 'jump-down-left',
  land = 'land',
  swipe = 'swipe',
  idleWithBall = 'idle-with-ball',
  chase = 'chase',
  chaseFriend = 'chase-friend',
  standRight = 'stand-right',
  standLeft = 'stand-left',
}

export enum FrameResult {
  stateContinue,
  stateComplete,
  // Special states
  stateCancel,
}

export class BallState {
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  paused: boolean;

  constructor(cx: number, cy: number, vx: number, vy: number) {
    this.cx = cx;
    this.cy = cy;
    this.vx = vx;
    this.vy = vy;
    this.paused = false;
  }
}

export function isStateAboveGround(state: States): boolean {
  return (
    state === States.climbWallLeft ||
    state === States.jumpDownLeft ||
    state === States.land ||
    state === States.wallHangLeft
  );
}

export function resolveState(state: string, pokemon: IPokemonType): IState {
  // The one seam between roaming strategies: everything else about the
  // state machine (the per-species sequence tree, swipe, ball/friend chase,
  // evolution, save/restore) is completely unaware a second strategy
  // exists - only which CLASS gets built for the wander states changes.
  if (isOverworldRoaming()) {
    switch (state) {
      case States.walkRight:
      case States.walkLeft:
        return new WalkOverworldState(pokemon, state, 1);
      case States.runRight:
      case States.runLeft:
        return new WalkOverworldState(pokemon, state, 1.6);
    }
  }

  switch (state) {
    case States.sitIdle:
      return new SitIdleState(pokemon);
    case States.walkRight:
      return new WalkRightState(pokemon);
    case States.walkLeft:
      return new WalkLeftState(pokemon);
    case States.runRight:
      return new RunRightState(pokemon);
    case States.runLeft:
      return new RunLeftState(pokemon);
    case States.lie:
      return new LieState(pokemon);
    case States.wallHangLeft:
      return new WallHangLeftState(pokemon);
    case States.climbWallLeft:
      return new ClimbWallLeftState(pokemon);
    case States.jumpDownLeft:
      return new JumpDownLeftState(pokemon);
    case States.land:
      return new LandState(pokemon);
    case States.swipe:
      return new SwipeState(pokemon);
    case States.idleWithBall:
      return new IdleWithBallState(pokemon);
    case States.chaseFriend:
      return new ChaseFriendState(pokemon);
    case States.standRight:
      return new StandRightState(pokemon);
    case States.standLeft:
      return new StandLeftState(pokemon);
  }
  return new SitIdleState(pokemon);
}

export interface IState {
  label: string;
  spriteLabel: string;
  horizontalDirection: HorizontalDirection;
  pokemon: IPokemonType;
  nextFrame(): FrameResult;
}

class AbstractStaticState implements IState {
  label = States.sitIdle;
  idleCounter: number;
  spriteLabel = 'idle';
  holdTime = 50;
  pokemon: IPokemonType;

  horizontalDirection = HorizontalDirection.left;

  constructor(pokemon: IPokemonType) {
    this.idleCounter = 0;
    this.pokemon = pokemon;
  }

  nextFrame(): FrameResult {
    this.idleCounter++;
    if (this.idleCounter > this.holdTime) {
      return FrameResult.stateComplete;
    }
    return FrameResult.stateContinue;
  }
}

export class SitIdleState extends AbstractStaticState {
  label = States.sitIdle;
  spriteLabel = 'idle';
  horizontalDirection = HorizontalDirection.right;
  holdTime = 50;
}

export class LieState extends AbstractStaticState {
  label = States.lie;
  spriteLabel = 'lie';
  horizontalDirection = HorizontalDirection.right;
  holdTime = 50;
}

export class WallHangLeftState extends AbstractStaticState {
  label = States.wallHangLeft;
  spriteLabel = 'wallgrab';
  horizontalDirection = HorizontalDirection.left;
  holdTime = 50;
}

export class LandState extends AbstractStaticState {
  label = States.land;
  spriteLabel = 'land';
  horizontalDirection = HorizontalDirection.left;
  holdTime = 10;
}

export class SwipeState extends AbstractStaticState {
  label = States.swipe;
  spriteLabel = 'idle'; // use base idle sprite
  horizontalDirection = HorizontalDirection.natural;
  holdTime = 15;
}

export class IdleWithBallState extends AbstractStaticState {
  label = States.idleWithBall;
  spriteLabel = 'with_ball';
  horizontalDirection = HorizontalDirection.left;
  holdTime = 30;
}

export class WalkRightState implements IState {
  label = States.walkRight;
  pokemon: IPokemonType;
  spriteLabel = 'walk';
  horizontalDirection = HorizontalDirection.right;
  leftBoundary: number;
  speedMultiplier = 1;
  idleCounter: number;
  holdTime = 60;

  constructor(pokemon: IPokemonType) {
    this.leftBoundary = Math.floor(getWorldWidth() * 0.95);
    this.pokemon = pokemon;
    this.idleCounter = 0;
  }

  nextFrame(): FrameResult {
    this.idleCounter++;
    this.pokemon.positionLeft(
      this.pokemon.left + this.pokemon.speed * this.speedMultiplier,
    );

    // Random chance to stop in the middle
    if (this.pokemon.isMoving && Math.random() < 0.01) {
      return FrameResult.stateComplete;
    }

    if (
      this.pokemon.isMoving &&
      this.pokemon.left >= this.leftBoundary - this.pokemon.width
    ) {
      return FrameResult.stateComplete;
    } else if (!this.pokemon.isMoving && this.idleCounter > this.holdTime) {
      return FrameResult.stateComplete;
    }
    return FrameResult.stateContinue;
  }
}

export class WalkLeftState implements IState {
  label = States.walkLeft;
  spriteLabel = 'walk_left';
  horizontalDirection = HorizontalDirection.left;
  pokemon: IPokemonType;
  speedMultiplier = 1;
  idleCounter: number;
  holdTime = 60;

  constructor(pokemon: IPokemonType) {
    this.pokemon = pokemon;
    this.idleCounter = 0;
  }

  nextFrame(): FrameResult {
    this.idleCounter++;
    this.pokemon.positionLeft(
      this.pokemon.left - this.pokemon.speed * this.speedMultiplier,
    );

    // Random chance to stop in the middle
    if (this.pokemon.isMoving && Math.random() < 0.01) {
      return FrameResult.stateComplete;
    }

    if (this.pokemon.isMoving && this.pokemon.left <= 0) {
      return FrameResult.stateComplete;
    } else if (!this.pokemon.isMoving && this.idleCounter > this.holdTime) {
      return FrameResult.stateComplete;
    }
    return FrameResult.stateContinue;
  }
}

export class RunRightState extends WalkRightState {
  label = States.runRight;
  spriteLabel = 'walk_fast';
  speedMultiplier = 1.6;
  holdTime = 130;
}

export class RunLeftState extends WalkLeftState {
  label = States.runLeft;
  spriteLabel = 'walk_fast';
  speedMultiplier = 1.6;
  holdTime = 130;
}

/**
 * Overworld (2D) roaming's wander state - substituted for
 * `WalkRightState`/`WalkLeftState`/`RunRightState`/`RunLeftState` by
 * `resolveState` when Overworld mode is active. One class handles all four
 * sequence-tree slots: direction is a straight-line walk toward a single
 * chosen (x, y) target rather than a fixed left/right heading, so there is
 * nothing left/right-specific to split into separate classes.
 *
 * `label` is threaded through from whichever `States` value `resolveState`
 * was actually asked for, so `currentStateEnum`/save-restore/the sequence
 * tree still see exactly `walkRight`/`walkLeft`/`runRight`/`runLeft` as
 * before - only the MOVEMENT this state performs differs from Classic mode.
 *
 * `spriteLabel`/`horizontalDirection` update at the END of each frame based
 * on this frame's actual dx, so `BasePokemonType.nextFrame()`'s facing/
 * animation choice (made just before calling into this state) reflects the
 * most recent real movement direction. A frame that is mostly vertical
 * leaves both exactly as they were - "retain previous facing direction"
 * rather than flipping on every small vertical-only step.
 */
export class WalkOverworldState implements IState {
  label: States;
  spriteLabel = 'walk';
  horizontalDirection = HorizontalDirection.right;
  pokemon: IPokemonType;
  speedMultiplier: number;
  targetX: number;
  targetY: number;
  idleCounter = 0;
  holdTime = 60;
  /** Hard safety cap so a target that is somehow never reached (e.g. the
   * screen shrank out from under it) cannot wander forever - matches
   * Classic's own `holdTime`-bounded idle, just for movement instead. */
  maxWalkFrames = 600;

  constructor(pokemon: IPokemonType, label: States, speedMultiplier = 1) {
    this.pokemon = pokemon;
    this.label = label;
    this.speedMultiplier = speedMultiplier;
    const target = chooseOverworldTarget(
      { x: pokemon.left, y: pokemon.bottom },
      getWorldWidth(),
      getWorldHeight(),
      pokemon.width,
    );
    this.targetX = target.x;
    this.targetY = target.y;
    this.updateFacing(target.x - pokemon.left);
  }

  private updateFacing(dx: number): void {
    // A small dead zone around 0 keeps a nearly-vertical target from
    // flipping facing back and forth every frame on floating-point noise.
    if (dx > 0.5) {
      this.horizontalDirection = HorizontalDirection.right;
      this.spriteLabel = 'walk';
    } else if (dx < -0.5) {
      this.horizontalDirection = HorizontalDirection.left;
      this.spriteLabel = 'walk_left';
    }
    // else: keep whatever facing/spriteLabel this state already had.
  }

  nextFrame(): FrameResult {
    this.idleCounter++;

    const dx = this.targetX - this.pokemon.left;
    const dy = this.targetY - this.pokemon.bottom;
    const remaining = Math.hypot(dx, dy);
    const speed = this.pokemon.speed * this.speedMultiplier;

    if (!this.pokemon.isMoving) {
      return this.idleCounter > this.holdTime
        ? FrameResult.stateComplete
        : FrameResult.stateContinue;
    }

    if (remaining <= speed || remaining < 0.5) {
      this.pokemon.positionLeft(this.targetX);
      this.pokemon.positionBottom(this.targetY);
      return FrameResult.stateComplete;
    }

    const stepX = (dx / remaining) * speed;
    const stepY = (dy / remaining) * speed;
    this.pokemon.positionLeft(this.pokemon.left + stepX);
    this.pokemon.positionBottom(this.pokemon.bottom + stepY);
    this.updateFacing(dx);

    // Same "stop early sometimes" feel Classic's walk states already have,
    // so Overworld pauses read the same way rather than always finishing a
    // full hop.
    if (Math.random() < 0.01) {
      return FrameResult.stateComplete;
    }
    if (this.idleCounter > this.maxWalkFrames) {
      return FrameResult.stateComplete;
    }
    return FrameResult.stateContinue;
  }
}

export class ChaseState implements IState {
  label = States.chase;
  spriteLabel = 'run';
  horizontalDirection = HorizontalDirection.left;
  ballState: BallState;
  canvas: HTMLCanvasElement;
  pokemon: IPokemonType;

  constructor(
    pokemon: IPokemonType,
    ballState: BallState,
    canvas: HTMLCanvasElement,
  ) {
    this.pokemon = pokemon;
    this.ballState = ballState;
    this.canvas = canvas;
  }

  nextFrame(): FrameResult {
    if (this.ballState.paused) {
      return FrameResult.stateCancel; // Ball is already caught
    }
    if (this.pokemon.left > this.ballState.cx) {
      this.horizontalDirection = HorizontalDirection.left;
      this.pokemon.positionLeft(this.pokemon.left - this.pokemon.speed);
    } else {
      this.horizontalDirection = HorizontalDirection.right;
      this.pokemon.positionLeft(this.pokemon.left + this.pokemon.speed);
    }

    if (
      this.canvas.height - this.ballState.cy <
        this.pokemon.width + this.pokemon.floor &&
      this.ballState.cx < this.pokemon.left &&
      this.pokemon.left < this.ballState.cx + 15
    ) {
      // hide ball
      this.canvas.style.display = 'none';
      this.ballState.paused = true;
      return FrameResult.stateComplete;
    }
    return FrameResult.stateContinue;
  }
}

export class ChaseFriendState implements IState {
  label = States.chaseFriend;
  spriteLabel = 'run';
  horizontalDirection = HorizontalDirection.left;
  pokemon: IPokemonType;

  constructor(pokemon: IPokemonType) {
    this.pokemon = pokemon;
  }

  nextFrame(): FrameResult {
    if (!this.pokemon.hasFriend || !this.pokemon.friend?.isPlaying) {
      return FrameResult.stateCancel; // Friend is no longer playing.
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (this.pokemon.left > this.pokemon.friend!.left) {
      this.horizontalDirection = HorizontalDirection.left;
      this.pokemon.positionLeft(this.pokemon.left - this.pokemon.speed);
    } else {
      this.horizontalDirection = HorizontalDirection.right;
      this.pokemon.positionLeft(this.pokemon.left + this.pokemon.speed);
    }

    return FrameResult.stateContinue;
  }
}

export class ClimbWallLeftState implements IState {
  label = States.climbWallLeft;
  spriteLabel = 'wallclimb';
  horizontalDirection = HorizontalDirection.left;
  pokemon: IPokemonType;

  constructor(pokemon: IPokemonType) {
    this.pokemon = pokemon;
  }

  nextFrame(): FrameResult {
    this.pokemon.positionBottom(this.pokemon.bottom + 1);
    if (this.pokemon.bottom >= 100) {
      return FrameResult.stateComplete;
    }
    return FrameResult.stateContinue;
  }
}

export class JumpDownLeftState implements IState {
  label = States.jumpDownLeft;
  spriteLabel = 'fall_from_grab';
  horizontalDirection = HorizontalDirection.right;
  pokemon: IPokemonType;

  constructor(pokemon: IPokemonType) {
    this.pokemon = pokemon;
  }

  nextFrame(): FrameResult {
    this.pokemon.positionBottom(this.pokemon.bottom - 5);
    if (this.pokemon.bottom <= this.pokemon.floor) {
      this.pokemon.positionBottom(this.pokemon.floor);
      return FrameResult.stateComplete;
    }
    return FrameResult.stateContinue;
  }
}

export class StandRightState extends AbstractStaticState {
  label = States.standRight;
  spriteLabel = 'stand';
  horizontalDirection = HorizontalDirection.right;
  holdTime = 60;
}

export class StandLeftState extends AbstractStaticState {
  label = States.standRight;
  spriteLabel = 'stand';
  horizontalDirection = HorizontalDirection.left;
  holdTime = 60;
}
