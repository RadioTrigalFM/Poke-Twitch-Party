/* =========================================================
   ANIMACIONES DE BAILE DE LA CHARCA (Lotad 270 y Ludicolo 272)
   -----------------------------------------------------------
   Datos de fotograma (FrameWidth/FrameHeight/Duration) extraídos del
   AnimData.xml de PMDCollab/SpriteCollab de cada Pokémon, más sus hojas
   de sprites ("-Anim.png") dentro de assets/pmd/<dex>/. Solo se
   incluyen las animaciones que usa el modo La Charca (js/modes/charca.js);
   Walk/Attack/Hurt/Sleep de estos dos Pokémon siguen en
   js/data/pmdLocalAnimDb.js. pmdSprite.js las fusiona por dex con el resto.
     - Swing   (ambos)   -> !giro
     - Attack  (ambos)   -> !paso   (ya estaba en pmdLocalAnimDb.js)
     - Rotate  (ambos)   -> !roto
     - Hop     (ambos)   -> !salto
     - Shake   (Lotad)   -> !agito
     - Emit    (Ludicolo)-> !agito
   ========================================================= */
export const PMD_CHARCA_ANIM_DB = {"0270":{"Swing":{"frameWidth":72,"frameHeight":72,"durations":[2,1,2,2,3,2,2,1,1],"imgUrl":"assets/pmd/0270/Swing-Anim.png"},"Rotate":{"frameWidth":24,"frameHeight":24,"durations":[2,2,2,2,2,2,2,2,2],"imgUrl":"assets/pmd/0270/Rotate-Anim.png"},"Hop":{"frameWidth":24,"frameHeight":72,"durations":[2,1,2,3,4,4,3,2,1,2],"imgUrl":"assets/pmd/0270/Hop-Anim.png"},"Shake":{"frameWidth":24,"frameHeight":40,"durations":[3,3,3,3,3,3,3,3,3,3],"imgUrl":"assets/pmd/0270/Shake-Anim.png"}},"0272":{"Swing":{"frameWidth":72,"frameHeight":88,"durations":[2,1,2,2,3,2,2,1,1],"imgUrl":"assets/pmd/0272/Swing-Anim.png"},"Rotate":{"frameWidth":32,"frameHeight":40,"durations":[2,2,2,2,2,2,2,2,2],"imgUrl":"assets/pmd/0272/Rotate-Anim.png"},"Hop":{"frameWidth":32,"frameHeight":88,"durations":[2,1,2,3,4,4,3,2,1,2],"imgUrl":"assets/pmd/0272/Hop-Anim.png"},"Emit":{"frameWidth":32,"frameHeight":56,"durations":[4,1,2,2,4,2,2,2,2,2,2,2,2],"imgUrl":"assets/pmd/0272/Emit-Anim.png"}}};
