{
  "targets": [
    {
      "target_name": "window_events_core",
      "type": "none",
      "conditions": [
        ["OS=='mac'", {
          "actions": [
            {
              "action_name": "build_swift_core",
              "message": "Building WindowEventsCore (Swift static library)",
              "inputs": [
                "Package.swift",
                "Sources/WindowEventsCore/Bridge.swift",
                "Sources/WindowEventsCore/Monitors.swift",
                "Sources/WindowEventsCore/HoverTracker.swift"
              ],
              "outputs": [
                "<(module_root_dir)/.build/release/libWindowEventsCore.a"
              ],
              "action": [
                "bash", "-c",
                "cd <(module_root_dir) && swift build -c release"
              ]
            }
          ]
        }]
      ]
    },
    {
      "target_name": "window_events",
      "sources": ["src/shim.mm"],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")",
        "window_events_core"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "10.15",
            "OTHER_CFLAGS": ["-fobjc-arc"],
            # Swift runtime libraries on modern macOS live in /usr/lib/swift.
            # `-L` makes them findable at link time; the rpath ensures the
            # dynamic loader can resolve them at runtime if any pulled-in
            # symbol turns out to be in a shared overlay.
            "OTHER_LDFLAGS": [
              "-L/usr/lib/swift",
              "-Wl,-rpath,/usr/lib/swift"
            ]
          },
          "libraries": [
            "<(module_root_dir)/.build/release/libWindowEventsCore.a",
            "-framework Cocoa",
            "-framework AppKit"
          ]
        }]
      ]
    }
  ]
}
