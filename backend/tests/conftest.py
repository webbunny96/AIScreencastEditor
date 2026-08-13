"""
Pytest configuration and fixtures
Mocks heavy dependencies (whisper) for testing
"""

import sys
import types

# Mock whisper module before any imports
whisper_mock = types.ModuleType('whisper')
setattr(whisper_mock, 'load_model', lambda *args, **kwargs: None)
setattr(whisper_mock, 'load_audio', lambda *args, **kwargs: [])
sys.modules['whisper'] = whisper_mock

# Create audio submodule
audio_mock = types.ModuleType('whisper.audio')
setattr(audio_mock, 'SAMPLE_RATE', 16000)
whisper_audio_pkg = types.ModuleType('whisper.audio.pkg')
# Add to sys.modules for `whisper.audio.SAMPLE_RATE` access
sys.modules['whisper.audio'] = audio_mock
# Also attach audio to whisper module
setattr(whisper_mock, 'audio', audio_mock)
