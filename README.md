# Board-Overlay

A modern, web-based board review and broadcast overlay tool with integrated video, chat, and OBS WebSocket controls.

## Features

### Real Board Feed
- **URL Link**: Add your board video feed URL (usually requires embed)
- **Audio Control**: URL is intentionally left open. You will need to add a way to mute this
- **Recommendation**: Highly recommend VDO Ninja with `&noaudio` parameter
- **Alternative**: You can also mute the tab this page is on
- **Purpose**: Shows where the overhead board will go and allows review with canvas overlay

### Stone Size
- **Purpose**: Allows matching as best as possible between board and overlay
- **Function**: Interpolated between the grid points but can be set manually
- **Usage**: Adjust the stone size to match your physical board stones

### Chat Integration
- **Requirement**: Chat URL requires embedding or URL that allows iframe embedding
- **Purpose**: Provides chat overlay for viewer interaction
- **Examples**: Twitch, YouTube, Discord, or custom chat systems

### OBS Camera
- **Purpose**: Provides an easy Face + UI layout for commentators
- **Location**: Appears in the side panel
- **Features**: Camera feed with commentator controls

### Side Panel
- **Behavior**: Shows if either Camera or Chat is available, otherwise hides automatically
- **Layout**: Adjusts dynamically based on available content

### OBS WebSocket Control
- **Purpose**: Allows users to control their OBS remotely
- **Setup**: You will likely need to forward an address to the local server of OBS
- **Local Usage**: If you want to use this locally, grab your OBS WebSocket Server URL and plug it in
- **Scenes**: Can be left empty if you want full control, or add specific scenes that you want available to the user/commentator

## Review Tools

### Stone Placement
- **Black Stone**: Place black stones on the board
- **White Stone**: Place white stones on the board
- **Erase**: Remove stones by clicking on them

### Drawing Tools
- **Drawing**: Free-hand drawing with customizable colors
- **Eraser**: Erase drawings and marks
- **Space**: Clear all stones, drawings, and markers

### Markers and Symbols
- **Triangle**: Place triangle markers
- **Circle**: Place circle markers  
- **Square**: Place square markers
- **Letters**: Place letters (A-Z) on the board

### Grid and Coordinates
- **Show Grid**: Toggle grid visibility
- **Show Coordinates**: Toggle coordinate labels (A-T, 1-19)

## OBS Controls

### Connection Status
- **Connected**: Green indicator when successfully connected to OBS
- **Disconnected**: Red indicator when not connected
- **Connecting**: Yellow indicator during connection attempt

### Scene Management
- **Scene Buttons**: Individual buttons for each available scene (up to 4 scenes)
- **Scene Dropdown**: Falls back to dropdown if more than 4 scenes
- **Current Scene Highlighting**: Active scene is highlighted in green
- **Scene Filtering**: Only shows scenes specified in URL parameters

### Stream Control
- **Toggle Button**: Single button that shows "Start Stream" or "Stop Stream"
- **Transition States**: Shows "Starting..." or "Stopping..." during transitions
- **Status Updates**: Real-time updates of streaming status

## URL Parameters

### Basic Parameters
- `OTB`: Main board video URL (double-encoded). Required for viewers.
- `Chat`: Chat embed URL
- `obs`: OBS controller VDO Ninja URL (double-encoded)
- `Network`: VDO Ninja room name
- `stone`: Stone size value
- `role`: `CO` (commentator) or `VW` (viewer)

### OBS Remote Control (via VDO Ninja)
- **How it works**: The OBS control panel is an embedded VDO Ninja iframe that relays OBS WebSocket controls through VDO Ninja. No direct browser-to-OBS WebSocket connection is required.
- **Scenes**: Use VDO Ninja’s built-in OBS control UI to expose scenes and stream controls.

### Grid Parameters
- `grid`: Grid corner coordinates (semicolon-separated)
### Coordinate Color
- `CC`: Coordinate label color (hex)

## Usage Examples

### Complete Setup URL
```
https://yoursite.com/?OTB=your-video-url&Chat=your-chat-url&obs=your-vdo-ninja-obs-url&Network=your-room&stone=125&role=CO
```

## Technical Notes

### OBS WebSocket Compatibility
- Supports OBS WebSocket v5.x
- Automatic authentication handling
- Fallback methods for different OBS versions
- Real-time event handling

### Browser Compatibility
- Modern browsers with WebSocket support
- HTTPS required for secure WebSocket connections
- Camera and microphone permissions for OBS feed

### Security Considerations
- OBS WebSocket passwords are not included in shareable URLs
- Passwords must be entered manually for security
- Scene lists are included in URLs for convenience

## Link
[Board-Overlay Tool](https://weiqipro.github.io/Board-Overlay/)
