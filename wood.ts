// ===================== SETTINGS =====================
// How far around you to look for oak trees
const RADIUS = 16
// How far below and above your feet to look
const BELOW = 3
const ABOVE = 12
// Empty sky used for the oak check. Must stay empty, and below the height limit (320).
const SKY = 260
const REF = 290

// Plant a sapling where each tree stood
const REPLANT_STUMPS = true
// At the end, plant leftover saplings on random grass around you
// (false = take them to the sapling drop-off instead)
const PLANT_SAPLINGS = true
// Collect dropped sticks/apples/saplings and visit the drop-offs every this many trees
const SWEEP_EVERY = 5
// Seconds to wait at the end so leaves can decay and drop their items
const LEAF_WAIT = 15

// Drop-off spots. Set them in-game by standing on the spot and typing
// setoak / setapple / setstick / setsapling, or put coordinates here,
// e.g. let oakDrop: Position = world(100, 64, -20)
// Any spot left unset uses the block you stood on when you typed "trees".
let oakDrop: Position = null
let appleDrop: Position = null
let stickDrop: Position = null
let saplingDrop: Position = null
// ====================================================

let running = false
let colX: number[] = []
let colZ: number[] = []
let y1 = 0
let y2 = 0
let cx = 0
let cy = 0
let cz = 0

// Your original commands
player.onChat("g", function () {
    player.say(agent.getItemDetail(1))
})
player.onChat("c", function () {
    agent.teleportToPlayer()
})
player.onChat("stop", function () {
    running = false
    player.say("Stopping...")
})

// Drop-off setters: stand on the spot (a hopper on a chest, or just the ground) and type these
player.onChat("setoak", function () {
    oakDrop = spotUnderMe()
    player.say("Oak log drop-off set")
})
player.onChat("setapple", function () {
    appleDrop = spotUnderMe()
    player.say("Apple drop-off set")
})
player.onChat("setstick", function () {
    stickDrop = spotUnderMe()
    player.say("Stick drop-off set")
})
player.onChat("setsapling", function () {
    saplingDrop = spotUnderMe()
    player.say("Sapling drop-off set")
})

// Extra commands to run the steps on their own later
player.onChat("sweep", function () {
    setCenterToMe()
    sweep()
    dropOff(false)
    player.say("Swept up items")
})
player.onChat("plant", function () {
    setCenterToMe()
    plantSaplings()
})

// Type "trees": find every oak tree around you, chop them, collect and store everything
player.onChat("trees", function () {
    if (running) {
        return
    }
    running = true
    setCenterToMe()
    colX = []
    colZ = []

    // Make sure the sky area starts empty
    player.execute("fill " + (cx - RADIUS) + " " + SKY + " " + (cz - RADIUS) + " " +
        (cx + RADIUS) + " " + (SKY + y2 - y1) + " " + (cz + RADIUS) + " air")

    // 1. Find the trees
    player.say("Searching for oak trees...")
    search(cx - RADIUS, cz - RADIUS, cx + RADIUS, cz + RADIUS, false)
    player.say("Found oak in " + colX.length + " spots")

    // 2. Chop them, stopping every few trees to sweep up and drop things off
    let chopped = 0
    for (let i = 0; i < colX.length && running; i++) {
        for (let y = y1; y <= y2; y++) {
            const p = world(colX[i], y, colZ[i])
            if (blocks.testForBlock(LOG_OAK, p)) {
                chopTree(p)
                chopped += 1
                player.say("Chopped tree " + chopped)
                if (chopped % SWEEP_EVERY == 0) {
                    sweep()
                    dropOff(false)
                }
                break
            }
        }
    }

    // 3. Wait for the leaves, then final sweep, planting and drop-off
    if (running) {
        player.say("Waiting for leaves to fall...")
        loops.pause(LEAF_WAIT * 1000)
        sweep()
        if (PLANT_SAPLINGS) {
            plantSaplings()
        }
        dropOff(true)
    }
    running = false
    player.say("Done! Chopped " + chopped + " trees")
})

// ---------- Finding trees ----------

function setCenterToMe() {
    const me = player.position()
    cx = me.getValue(Axis.X)
    cy = me.getValue(Axis.Y)
    cz = me.getValue(Axis.Z)
    y1 = cy - BELOW
    y2 = cy + ABOVE
}

// Is there any oak log in this area? Copies only the oak logs up into the sky,
// then compares that with empty sky.
function hasOak(x1: number, z1: number, x2: number, z2: number): boolean {
    const h = y2 - y1
    player.execute("clone " + x1 + " " + y1 + " " + z1 + " " + x2 + " " + y2 + " " + z2 + " " +
        x1 + " " + SKY + " " + z1 + " filtered force oak_log")
    const empty = player.execute("testforblocks " + x1 + " " + SKY + " " + z1 + " " +
        x2 + " " + (SKY + h) + " " + z2 + " " + x1 + " " + REF + " " + z1 + " all")
    if (!empty) {
        player.execute("fill " + x1 + " " + SKY + " " + z1 + " " +
            x2 + " " + (SKY + h) + " " + z2 + " air")
    }
    return !empty
}

// Split the area in half again and again, only keeping halves with oak
function search(x1: number, z1: number, x2: number, z2: number, known: boolean) {
    if (!running) {
        return
    }
    if (!known && !hasOak(x1, z1, x2, z2)) {
        return
    }
    if (x1 == x2 && z1 == z2) {
        colX.push(x1)
        colZ.push(z1)
        return
    }
    if (x2 - x1 >= z2 - z1) {
        const mid = Math.floor((x1 + x2) / 2)
        const firstHas = hasOak(x1, z1, mid, z2)
        if (firstHas) {
            search(x1, z1, mid, z2, true)
        }
        search(mid + 1, z1, x2, z2, !firstHas)
    } else {
        const mid = Math.floor((z1 + z2) / 2)
        const firstHas = hasOak(x1, z1, x2, mid)
        if (firstHas) {
            search(x1, z1, x2, mid, true)
        }
        search(x1, mid + 1, x2, z2, !firstHas)
    }
}

// ---------- Chopping ----------

function chopTree(start: Position) {
    const todo: Position[] = [start]
    let baseX = start.getValue(Axis.X)
    let baseY = start.getValue(Axis.Y)
    let baseZ = start.getValue(Axis.Z)
    let count = 0
    while (todo.length > 0 && count < 100) {
        const q = todo.pop()
        if (!blocks.testForBlock(LOG_OAK, q)) {
            continue
        }
        blocks.fill(AIR, q, q, FillOperation.Destroy)
        count += 1
        const x = q.getValue(Axis.X)
        const y = q.getValue(Axis.Y)
        const z = q.getValue(Axis.Z)
        if (y < baseY) {
            baseX = x
            baseY = y
            baseZ = z
        }
        todo.push(world(x, y + 1, z))
        todo.push(world(x, y - 1, z))
        todo.push(world(x + 1, y, z))
        todo.push(world(x - 1, y, z))
        todo.push(world(x, y, z + 1))
        todo.push(world(x, y, z - 1))
        todo.push(world(x + 1, y + 1, z))
        todo.push(world(x - 1, y + 1, z))
        todo.push(world(x, y + 1, z + 1))
        todo.push(world(x, y + 1, z - 1))
    }
    agent.teleport(world(baseX, baseY + 1, baseZ), NORTH)
    agent.collectAll()
    if (REPLANT_STUMPS && findSapling()) {
        agent.place(DOWN)
    }
}

// ---------- Collecting dropped items ----------

// Pulls every dropped item around the search area to the agent and picks it up
function sweep() {
    agent.teleport(world(cx, cy, cz), NORTH)
    player.execute("tp @e[type=item,x=" + cx + ",y=" + cy + ",z=" + cz + ",r=" + (RADIUS + 10) + "] " +
        cx + " " + cy + " " + cz)
    loops.pause(500)
    agent.collectAll()
}

// ---------- Planting ----------

// Plants saplings on random grass around the search area, at least 3 blocks apart
function plantSaplings() {
    const plantedX: number[] = []
    const plantedZ: number[] = []
    let tries = 0
    let planted = 0
    while (findSapling() && tries < 80) {
        tries += 1
        const x = cx + randint(-RADIUS, RADIUS)
        const z = cz + randint(-RADIUS, RADIUS)
        let tooClose = false
        for (let i = 0; i < plantedX.length; i++) {
            if (Math.abs(plantedX[i] - x) < 3 && Math.abs(plantedZ[i] - z) < 3) {
                tooClose = true
            }
        }
        if (tooClose) {
            continue
        }
        const y = findGrass(x, z)
        if (y < 0) {
            continue
        }
        agent.teleport(world(x, y + 2, z), NORTH)
        agent.place(DOWN)
        plantedX.push(x)
        plantedZ.push(z)
        planted += 1
    }
    player.say("Planted " + planted + " saplings")
}

// Looks down a column for the top block. Returns its height if it's grass, otherwise -1.
function findGrass(x: number, z: number): number {
    for (let y = y2; y >= y1; y--) {
        const p = world(x, y, z)
        if (blocks.testForBlock(AIR, p)) {
            continue
        }
        if (blocks.testForBlock(GRASS, p)) {
            return y
        }
        return -1 // top block is something else (leaves, water, stone...)
    }
    return -1
}

// Selects an oak sapling in the agent's inventory, if it has one
function findSapling(): boolean {
    for (let slot = 1; slot <= 27; slot++) {
        if (agent.getItemDetail(slot) == OAK_SAPLING) {
            agent.setSlot(slot)
            return true
        }
    }
    return false
}

// ---------- Drop-offs ----------

// The block you're standing on (a hopper or chest counts even though it's not a full block)
function spotUnderMe(): Position {
    const me = player.position()
    const x = me.getValue(Axis.X)
    const y = me.getValue(Axis.Y)
    const z = me.getValue(Axis.Z)
    const feet = world(x, y, z)
    if (blocks.testForBlock(HOPPER, feet) || blocks.testForBlock(CHEST, feet)) {
        return feet
    }
    return world(x, y - 1, z)
}

function orDefault(spot: Position): Position {
    if (spot) {
        return spot
    }
    return world(cx, cy - 1, cz)
}

// Takes items to their drop-offs. Saplings stay with the agent until the end
// if PLANT_SAPLINGS is on, so they can be planted.
function dropOff(final: boolean) {
    dropItem(LOG_OAK, orDefault(oakDrop))
    dropItem(APPLE, orDefault(appleDrop))
    dropItem(STICK, orDefault(stickDrop))
    if (final || !PLANT_SAPLINGS) {
        dropItem(OAK_SAPLING, orDefault(saplingDrop))
    }
    if (final) {
        // anything else left over goes with the oak
        const spot = orDefault(oakDrop)
        agent.teleport(world(spot.getValue(Axis.X), spot.getValue(Axis.Y) + 1, spot.getValue(Axis.Z)), NORTH)
        agent.dropAll(DOWN)
    }
}

// Stands on top of the drop-off spot and drops every stack of this item onto it.
// If the spot is a hopper on a chest, the items go into the chest.
function dropItem(item: number, spot: Position) {
    let has = false
    for (let slot = 1; slot <= 27; slot++) {
        if (agent.getItemDetail(slot) == item) {
            has = true
        }
    }
    if (!has) {
        return
    }
    if (blocks.testForBlock(CHEST, spot)) {
        player.say("Put a hopper on the chest at your drop-off so items go inside")
    }
    agent.teleport(world(spot.getValue(Axis.X), spot.getValue(Axis.Y) + 1, spot.getValue(Axis.Z)), NORTH)
    for (let slot = 1; slot <= 27; slot++) {
        if (agent.getItemDetail(slot) == item) {
            agent.drop(DOWN, slot, agent.getItemCount(slot))
        }
    }
}
