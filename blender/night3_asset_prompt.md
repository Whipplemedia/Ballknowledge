# Night 3 reference images: the prompt

Paste everything between the lines into an image generator (ChatGPT image generation works well), in one conversation. It makes one image per asset, then you zip the folder and send it back. Decisions so far: club name The End Zone; games: Make It Rain, bottle service + the VIP athlete, shot girl roulette, the bachelor-party side job, Amateur Night pole dancing; cops with a sobriety test (failing costs 50 seconds in the squad car).

---

I'm making reference images for a 3D video game. Each image will be turned into a 3D model with an image-to-3D tool, so every image must follow these rules exactly.

**The game and its style.** Ball Knowledge is a comedy co-op sports-betting game set in a Chicago dive bar at night. This is night 3: a strip club called **THE END ZONE Gentlemen's Club** opens next door, and the police show up. Art style for everything: stylized cartoon 3D game art, chunky friendly proportions, slightly oversized heads and hands on characters, simple clean shapes, smooth hand-painted textures, bright readable colors, like a modern party video game (think Fortnite or Fall Guys). Funny, not gritty. Keep it PG-13: every dancer is fully covered in a sparkly club outfit (crop top and shorts, or a sequined dress), with no nudity and nothing explicit. No real brands, logos, team names or real people: invent everything.

**Rules for every image.**
1. One subject per image, centered, the whole subject in frame with a little space around it. Nothing cropped.
2. Plain, flat light-gray background (#D9D9D9). No floor, no scenery, no shadows on the ground, no other objects.
3. Soft, even studio lighting from the front. No dramatic lighting, no glow effects, no motion blur.
4. A three-quarter front view (turned about 30 degrees), camera at chest height, unless the asset says otherwise.
5. No text in the image except words that are painted on the object itself (signs, sashes, car doors).
6. Square image, at least 1024 x 1024.

**Extra rules for characters.**
- Full body, head to shoes, standing in an A-pose: arms straight and angled down about 45 degrees away from the body, palms facing the thighs, fingers together, feet shoulder-width apart, facing the camera, neutral relaxed face.
- Nothing held in the hands (props are separate images). Hair and clothing must not cover the face or hang between the arms and body.
- Make two images per character: one from the **front** and one from the **back**, same pose, same lighting.

**Folder and file names.** Put every image in one folder named `EndZone_Night3_Assets`, with these four subfolders. Use these exact file names (all lowercase, PNG):

```
EndZone_Night3_Assets/
  01_characters/
  02_props/
  03_environment/
  04_vehicles/
  _index.txt
```

`_index.txt` lists every file name, one per line, followed by a dash and the one-line description used to make it. When done, zip the whole folder as `EndZone_Night3_Assets.zip`.

**The assets.**

`01_characters/` (front and back of each: `char_<name>_front.png`, `char_<name>_back.png`)

1. `dancer_1`: a confident club dancer, mid-20s, big curly hair in a high ponytail, a sparkly gold sequined crop top and high-waisted gold shorts, knee-high white boots. Friendly smile.
2. `dancer_2`: a club dancer, late 20s, a sleek long black bob, a hot-pink sequined mini dress with long sleeves, platform heels. Playful smirk.
3. `bouncer`: a huge bald bouncer, black tight T-shirt reading "SECURITY", black pants, an earpiece, sunglasses pushed up on his forehead, arms that look like they could lift a car. Stone-faced.
4. `dj`: a wiry club DJ with oversized headphones around his neck, a backwards cap, a loud zebra-print jacket over a neon green tank top, gold chains.
5. `vip_athlete`: a parody pro football superstar out partying the night before the big game: tall and muscular, a white fur coat over a shiny purple suit, oversized diamond-look sunglasses, a giant gold chain with a football pendant, fresh sneakers. Smug grin.
6. `shot_girl`: a shot girl in a black referee-striped crop top and black shorts, a holster belt of fake shot bottles on her hips, a whistle around her neck. Mischievous grin.
7. `groom`: a hammered bachelor-party groom, mid-30s, rumpled white dress shirt untucked, loosened tie, a pink sash reading "GROOM", a plastic tiara slightly crooked on his head, one shoe untied. Happy and dazed.
8. `cop_1`: a big-mustached veteran city police officer, 50s, navy blue uniform shirt and pants, a duty belt, a peaked police cap, a badge reading "CITY POLICE", a slight belly. Unimpressed squint.
9. `cop_2`: a young eager city police officer, late 20s, hair in a tight bun under the peaked cap, navy blue uniform shirt and pants, a duty belt, a badge reading "CITY POLICE". Over-serious expression.

`02_props/` (one image each: `prop_<name>.png`)

10. `stripper_pole`: a shiny chrome dance pole, floor to ceiling (about 3 m tall), with round chrome base and ceiling plates. Straight on, front view.
11. `money_gun`: a cartoon toy "money gun" cash blaster, bright green and gold, a slot of dollar bills sticking out of the top. Side view.
12. `cash_fan`: a fanned-out spread of about 10 green dollar bills held together at the bottom with a gold money clip.
13. `champagne_bucket`: a silver ice bucket holding a fancy gold-foil champagne bottle with a lit sparkler candle stuck on top.
14. `shot_tray`: a round black serving tray with six shot glasses in a ring; five hold amber liquid, one holds bright red liquid.
15. `vip_rope`: two gold stanchion posts joined by a draped red velvet rope. Front view.
16. `groom_sash`: a pink satin sash on its own, laid flat, reading "GROOM" in white letters.
17. `flashlight`: a long black police flashlight. Side view.

`03_environment/` (`env_<name>.png`)

18. `club_facade`: the front of THE END ZONE Gentlemen's Club as a flat, straight-on building front (camera square to the wall, no perspective): black brick, a big neon sign "THE END ZONE" in hot pink with a neon football and goalposts, "Gentlemen's Club" in smaller blue neon script below, a padded black door with gold trim under a short purple awning, two blacked-out windows with pink neon outlines. Wider than tall (about 2:1). Night lighting on the sign only; the rest evenly lit.
19. `main_stage`: the club's main stage on its own: a raised round black-lacquer stage with a short runway, a strip of small gold lights around its edge, one chrome pole in the middle. Three-quarter view from above.
20. `vip_booth`: a curved purple velvet VIP booth sofa around a small round black table. Three-quarter view.
21. `dj_booth`: a DJ booth: a black desk with two turntables, a glowing mixer, a laptop, and a light-up front panel with a football graphic.
22. `club_chair`: a small round-backed lounge chair in purple velvet with gold legs.
23. `mirror_ball`: a disco mirror ball hanging from a short chain.
24. `stage_light`: a black stage spotlight can on a small yoke mount.
25. `club_wall_texture`: a flat, square, seamlessly tiling texture of the club's walls: dark purple velvet wallpaper with a subtle gold football-lace pattern. Straight on, no lighting effects.
26. `club_floor_texture`: a flat, square, seamlessly tiling texture of the club floor: glossy black and dark purple checkerboard tiles. Straight on.

`04_vehicles/` (`veh_<name>.png`)

27. `squad_car`: a classic boxy American police cruiser sedan, black-and-white paint, "CITY POLICE" on the doors, a red and blue light bar on the roof (lights off, painted red and blue), a push bar on the front. Three-quarter front view, wheels straight.
28. `squad_car_back`: the same squad car from the three-quarter back view.

Make the images one at a time in this order, keep the style identical across all of them, and confirm the file name for each one as you go.

---

## What happens next (for us)

When the zip comes back: characters go through Meshy (front + back images into multi-image-to-3D, then rig and animate); props and the car through image-to-3D; the two textures are used as they are; the facade becomes the club's false front like the gas station's. I'll confirm Meshy credit costs before spending. The pole dance moves come from Meshy text-to-motion, so they need no images.
