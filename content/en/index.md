---
layout: AtmoHome
id: home
title: ATMO Engine
titleTemplate: false
description: ATMO is a lightweight C++ game engine with an Entity Component System, Luau scripting and a built-in editor.
sidebar: false
outline: false
pageClass: atmo-home-page

hero:
    name: ATMO Engine
    text: Build 2D games, entity by entity.
    tagline: A lightweight C++23 engine with an Entity Component System, Luau scripting and a built-in editor.
    actions:
        - theme: brand
          text: Get started
          link: /getting-started/
        - theme: alt
          text: C++ API reference
          link: /api/cpp/
---

<div class="home-file">
<p class="home-file__tab"><span class="home-file__diamond is-script"></span>move_sprite.luau</p>

```luau
function Update(deltaTime)
    local transform = this:getTransform()
    if transform == nil then return end

    if Input.isPressed("D") then
        transform.position.x = transform.position.x + 100 * deltaTime
    end

    if Input.isPressed("Q") then
        transform.position.x = transform.position.x - 100 * deltaTime
    end
end
```

<p class="home-file__note">From <code>assets/script/move_sprite.luau</code> in the engine repository.</p>
</div>

<div class="home-file">
<p class="home-file__tab"><span class="home-file__diamond is-native"></span>my_addon.cpp</p>

```cpp
#include "addon/addon.hpp"
#include <spdlog/spdlog.h>

using namespace atmo::addon;

ATMO_REGISTER_ADDON()
{
    spdlog::info("Hello world from My Addon addon!");
}
```

<p class="home-file__note">The entry point the editor generates for a new library addon.</p>
</div>
