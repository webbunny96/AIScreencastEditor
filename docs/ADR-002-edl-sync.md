# ADR-002: EDL State Management & Synchronization

## Status
Accepted

## Context
The editor requires perfect synchronization between three main components:
1. Video player (playback position)
2. Transcript (text segments)
3. Timeline (visual regions)

Any change in one component must be reflected in the others. We need a robust state management approach.

## Decision
We will use **Zustand** as the single source of truth with the following design:

### State Structure
- `edl`: Array of segments with `{id, start, end, text, keep, reason}`
- `currentTime`: Current playback position
- `duration`: Total video duration
- `isPlaying`: Playback state
- `videoRef`: Reference to HTML video element

### Synchronization Flow
1. **VideoPlayer → Store**: `timeupdate` event → `setCurrentTime()`
2. **Store → VideoPlayer**: `seek()` action updates `video.currentTime`
3. **Store → Timeline**: `currentTime` → `ws.setTime()`
4. **Timeline → Store**: Region drag → `updateSegmentTimes()`
5. **Transcript → Store**: Segment click → `seek()`

### Skip Logic
- `getSkippedSegmentAtTime()`: Returns removed segment at current time
- VideoPlayer checks this on `timeupdate` and jumps to segment end

### Performance Optimizations
- **Debounced updates**: `setCurrentTime` only updates if difference > 0.05s
- **Selectors**: Memoized selectors for component-specific state
- **Virtualization**: Transcript uses custom virtualization for long videos

## Consequences
### Positive
- Single source of truth prevents drift
- Predictable data flow
- Easy to test and debug
- Performance optimized for large EDLs

### Negative
- Requires careful dependency management in effects
- Zustand store grows with features

## Alternatives Considered
1. **Redux**: More boilerplate, overkill for this scale
2. **Context API**: Re-renders too frequently for video sync
3. **Local component state**: Would cause synchronization drift