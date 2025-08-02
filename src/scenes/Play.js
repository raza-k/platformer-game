
import Phaser from 'phaser';
import Player from '../entities/Player';
import Enemies from '../groups/Enemies';
import Collectables from '../groups/Collectables';
import Hud from '../hud';
import EventEmitter from '../events/Emitter';

import initAnims from '../anims';

class Play extends Phaser.Scene {

  constructor(config) {
    super('PlayScene');
    this.config = config;
  }

  create({gameStatus}) {
    this.score = 0;
    this.hud = new Hud(this, 0, 0);

    this.playBgMusic();
    this.collectSound = this.sound.add('coin-pickup', {volume: 0.2});

    const map = this.createMap();
    initAnims(this.anims);

    const layers = this.createLayers(map);
    const playerZones = this.getPlayerZones(layers.playerZones);
    const player1 = this.createPlayer(playerZones.start);
    // Player 2: WASD controls
    const wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });
    // Offset player2's start position so they don't overlap
    const player2Start = { x: playerZones.start.x + 50, y: playerZones.start.y };
    const player2 = this.createPlayer(player2Start, wasd);
    const enemies = this.createEnemies(layers.enemySpawns, layers.platformsColliders);
    const collectables = this.createCollectables(layers.collectables);

    this.createEnemyColliders(enemies, {
      colliders: {
        platformsColliders: layers.platformsColliders,
        player1,
        player2
      }
    });

    this.createPlayerColliders(player1, {
      colliders: {
        platformsColliders: layers.platformsColliders,
        projectiles: enemies.getProjectiles(),
        collectables,
        traps: layers.traps
      }
    });
    this.createPlayerColliders(player2, {
      colliders: {
        platformsColliders: layers.platformsColliders,
        projectiles: enemies.getProjectiles(),
        collectables,
        traps: layers.traps
      }
    });

    this.createBG(map);
    this.createBackButton();
    this.createEndOfLevel(playerZones.end, player1);
    this.setupFollowupCameraOn(player1);

    if (gameStatus === 'PLAYER_LOOSE') { return; }

    this.createGameEvents();
  }

  playBgMusic() {
    if (this.sound.get('theme')) { return; }
    this.sound.add('theme', {loop: true, volume: 0.03}).play();
  }

  createMap() {
    const map = this.make.tilemap({key: `level_${this.getCurrentLevel()}`});
    map.addTilesetImage('main_lev_build_1', 'tiles-1');
    map.addTilesetImage('bg_spikes_tileset', 'bg-spikes-tileset');
    return map;
  }

  createLayers(map) {
    const tileset = map.getTileset('main_lev_build_1');
    const tilesetBg = map.getTileset('bg_spikes_tileset');

    map.createStaticLayer('distance', tilesetBg).setDepth(-12);

    const platformsColliders = map.createStaticLayer('platforms_colliders', tileset).setAlpha(0);
    const environment = map.createStaticLayer('environment', tileset).setDepth(-2);
    const platforms = map.createStaticLayer('platforms', tileset);
    const playerZones = map.getObjectLayer('player_zones');
    const enemySpawns = map.getObjectLayer('enemy_spawns');
    const collectables = map.getObjectLayer('collectables');
    const traps = map.createStaticLayer('traps', tileset);

    platformsColliders.setCollisionByProperty({collides: true});
    traps.setCollisionByExclusion(-1)

    return {
      environment,
      platforms,
      platformsColliders,
      playerZones,
      enemySpawns,
      collectables,
      traps };
  }

  createBG(map) {
    const bgObject = map.getObjectLayer('distance_bg').objects[0];

    this.spikesImage = this.add.tileSprite(bgObject.x, bgObject.y, this.config.width, bgObject.height, 'bg-spikes-dark')
      .setOrigin(0, 1)
      .setDepth(-10)
      .setScrollFactor(0, 1)

    this.skyImage = this.add.tileSprite(0, 0, this.config.width, 180, 'sky-play')
      .setOrigin(0, 0)
      .setDepth(-11)
      .setScale(1.1)
      .setScrollFactor(0, 1)
  }

  createBackButton() {
    const btn = this.add.image(this.config.rightBottomCorner.x, this.config.rightBottomCorner.y, 'back')
      .setOrigin(1)
      .setScrollFactor(0)
      .setScale(2)
      .setInteractive()

    btn.on('pointerup', () => {
      this.scene.start('MenuScene');
    })

  }

  createGameEvents() {
    EventEmitter.on('PLAYER_LOOSE', () => {
      console.log('Helko!');
      this.scene.restart({gameStatus: 'PLAYER_LOOSE'});
    })
  }

  createCollectables(collectableLayer) {
    const collectables = new Collectables(this).setDepth(-1);

    collectables.addFromLayer(collectableLayer);
    collectables.playAnimation('diamond-shine');

    return collectables;
  }

  createPlayer(start, controls) {
    return new Player(this, start.x, start.y, controls);
  }

  createEnemies(spawnLayer, platformsColliders) {
    const enemies = new Enemies(this);
    const enemyTypes = enemies.getTypes();

    spawnLayer.objects.forEach((spawnPoint, i) => {
      // if (i === 1) { return; }
      const enemy = new enemyTypes[spawnPoint.type](this, spawnPoint.x, spawnPoint.y);
      enemy.setPlatformColliders(platformsColliders)
      enemies.add(enemy);
    })

    return enemies;
  }

  onPlayerCollision(enemy, player1) {
    player1.takesHit(enemy);
  }

  onHit(entity, source) {
    entity.takesHit(source);
  }

  onCollect(entity, collectable) {
    this.score += collectable.score;
    this.hud.updateScoreboard(this.score);
    this.collectSound.play();
    collectable.disableBody(true, true);
  }

  createEnemyColliders(enemies, { colliders }) {
    enemies
      .addCollider(colliders.platformsColliders)
      .addCollider(colliders.player1, this.onPlayerCollision)
      .addCollider(colliders.player1.projectiles, this.onHit)
      .addOverlap(colliders.player1.meleeWeapon, this.onHit)
    // Add colliders for player2 if present
    if (colliders.player2) {
      enemies
        .addCollider(colliders.player2, this.onPlayerCollision)
        .addCollider(colliders.player2.projectiles, this.onHit)
        .addOverlap(colliders.player2.meleeWeapon, this.onHit);
    }
  }

  createPlayerColliders(player1, { colliders }) {
    player1
      .addCollider(colliders.platformsColliders)
      .addCollider(colliders.projectiles, this.onHit)
      .addCollider(colliders.traps, this.onHit)
      .addOverlap(colliders.collectables, this.onCollect, this)
  }

  createPlayer2Colliders(player2, { colliders }) {
    player2
      .addCollider(colliders.platformsColliders)
      .addCollider(colliders.projectiles, this.onHit)
      .addCollider(colliders.traps, this.onHit)
      .addOverlap(colliders.collectables, this.onCollect, this)
    // Add colliders for player2
    this.createPlayerColliders(player2, {
      colliders: {
        platformsColliders: layers.platformsColliders,
        projectiles: enemies.getProjectiles(),
        collectables,
        traps: layers.traps
      }
    });

    // Add end of level for player2
    this.createEndOfLevel(playerZones.end, player2);
  }

  setupFollowupCameraOn(player1) {
    const { height, width, mapOffset, zoomFactor } = this.config;
    this.physics.world.setBounds(0, 0, width + mapOffset, height + 200);
    this.cameras.main.setBounds(0, 0, width + mapOffset, height).setZoom(zoomFactor);
    this.cameras.main.startFollow(player1);
  }

  getPlayerZones(playerZonesLayer) {
    const playerZones = playerZonesLayer.objects;
    return {
      start: playerZones.find(zone => zone.name === 'startZone'),
      end: playerZones.find(zone => zone.name === 'endZone')
    }
  }

  getCurrentLevel() {
    return this.registry.get('level') || 1;
  }

  createEndOfLevel(end, player1) {
    const endOfLevel = this.physics.add.sprite(end.x, end.y, 'end')
      .setAlpha(0)
      .setSize(5, this.config.height)
      .setOrigin(0.5, 1);

    const eolOverlap = this.physics.add.overlap(player1, endOfLevel, () => {
      eolOverlap.active = false;

      if (this.registry.get('level') === this.config.lastLevel) {
        this.scene.start('CreditsScene');
        return;
      }

      this.registry.inc('level', 1);
      this.registry.inc('unlocked-levels', 1);
      this.scene.restart({gameStatus: 'LEVEL_COMPLETED'})
    })
  }

  update() {
    this.spikesImage.tilePositionX = this.cameras.main.scrollX * 0.3;
    this.skyImage.tilePositionX = this.cameras.main.scrollX * 0.1;
  }
}

export default Play;
