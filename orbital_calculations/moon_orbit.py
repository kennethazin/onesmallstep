import matplotlib.pyplot as plt
import numpy as np
from scipy.integrate import solve_ivp
import os
import json
import datetime

# Constants
omega = 2.6617e-6 # rad/s, Moon rotation rate
Re = 1738000 # m, lunar radius
g0 = 1.62 # m/s², surface gravity
mu = g0 * Re**2 # m³/s², gravitational parameter
deg = np.pi / 180 # degrees to radians

# CSM Parameters
csm_alt = 110000 # m, CSM orbital altitude (110 km)
csm_radius = Re + csm_alt  # m, CSM orbital radius
csm_velocity = np.sqrt(mu / csm_radius)  # m/s, CSM orbital velocity
csm_period = 2 * np.pi * csm_radius / csm_velocity  # s, CSM orbital period

# LM Stage Parameters
# Descent Stage
LM_Descent_Thrust = 45040 * 7 # N, Descent engine thrust
LM_Descent_Isp = 311# s, specific impulse
LM_Descent_mstruc = 2180 # kg, dry mass
LM_Descent_mprop = 8200 # kg, propellant mass
LM_Descent_tburn = 756 # s, burn duration for descent
LM_Descent_mdot = LM_Descent_Thrust / (LM_Descent_Isp * 9.81)  # kg/s

# Combined LM mass for descent
LM_Descent_m0 = LM_Descent_mstruc + LM_Descent_mprop # Assuming only descent stage mass for this sim

# Apollo 11 landing site
launch_latitude = 0.67416 * deg  # radians
launch_longitude = (23.47315 + 1) * deg  # radians, 23.473


# Simulation time parameters
t_max_descent = 800 # s, max descent sim time


# CSM Orbit Simulation
def csm_orbit(t, initial_phase):
    # this calculates CSM position at time t with given initial phase
    # Orbital period
    period = csm_period
    # Current phase
    phase = initial_phase - (t / period) * 2 * np.pi

    x = csm_radius * np.cos(phase)
    y = csm_radius * np.sin(phase)
    z = 0
    return x, y, z, phase

# Descent Stage Guidance
def descent_pitch_program(t, altitude, target_alt=0):
    # Returns the target pitch angle for descent at time t and altitude
    # Pre-PDI phase
    if t < pdi_seconds:
        return -1 * deg # Very shallow initial pitch

    # Final vertical descent phase when very close to the surface
    vertical_descent_alt = 150 # Start vertical descent phase below this altitude (meters) - Lowered threshold
    if altitude < vertical_descent_alt:
        return -90 * deg # Straight down relative to local horizontal

    # --- Pitch program based on altitude for intermediate phase ---
    # This provides a steeper profile as altitude decreases.

    if altitude > 10000: # High altitude (>10km), braking phase
        return -15 * deg
    elif altitude > 5000: # Medium-high altitude (5-10km), start pitching down
        return -30 * deg
    elif altitude > 2000: # Medium altitude (2-5km), significant pitch down ("knee" phase)
        return -45 * deg
    elif altitude > 500: # Lower altitude (0.5-2km), very steep approach - Changed threshold
        return -90 * deg # Make this phase very steep
    else: # Altitude between vertical_descent_alt (150m) and 500m
        # Maintain very steep angle before final vertical drop
        return -90 * deg # Extremely steep just before vertical

def descent_throttle_program(t, altitude, velocity):
    # Returns thrust fraction based on time, altitude and velocity
    descent_rate = -velocity

    # Pre-PDI phase
    if t < pdi_seconds:
        return 0.05

    # Target slower descent times
    target_descent_duration = 12.5 * 60
    elapsed_since_pdi = t - pdi_seconds

    # Limit throttle to slow down descent
    if altitude > 10000:
        return min(0.5, 0.2 + elapsed_since_pdi/800)  # Gradually increase to 0.5
    elif altitude > 4000:
        return 0.6  # Moderate thrust
    elif altitude > 1000:
        if descent_rate > 15:
            return 0.7  # Slow down if descending too fast
        return 0.55  # Otherwise moderate thrust
    else:
        # Terminal descent - hover longer
        if descent_rate > 5:
            return 0.8  # More thrust to slow down
        else:
            return 0.1  # Very gentle final descent

# Descent Trajectory Simulation
def descent_derivatives(t, state):
    """Calculate state derivatives for lunar descent"""
    r, theta, phi, v, gamma, psi, m = state

    # Local gravity
    g = mu / r**2

    # Determine thrust
    remaining_propellant = m - LM_Descent_mstruc # Check against descent stage dry mass
    if t < LM_Descent_tburn and remaining_propellant > 0:
        altitude = r - Re
        # For descent, negative velocity means descending
        descent_rate = -v * np.sin(gamma) if gamma != 0 else 0 # Avoid issues if gamma is exactly 0
        throttle = descent_throttle_program(t, altitude, descent_rate)
        T = LM_Descent_Thrust * throttle
        mdot = -LM_Descent_mdot * throttle
    else:
        T = 0
        mdot = 0

    # Target pitch from guidance (negative for descent)
    gamma_target = descent_pitch_program(t, r - Re)

    # Simple guidance - Increase max_rate for faster pitch changes
    K_p = 4  # Proportional gain (slightly increased for responsiveness)
    max_rate = 90 * deg  # Max angular rate (Increased from 1.0 to 2.5 deg/s)
    gamma_dot = np.clip(K_p * (gamma_target - gamma), -max_rate, max_rate)

    # Position derivatives - for descent gamma is negative, so r_dot is negative
    r_dot = v * np.sin(gamma)
    theta_dot = v * np.cos(gamma) * np.cos(psi) / (r * np.cos(phi)) if r > 0 and np.cos(phi) != 0 else 0
    phi_dot = v * np.cos(gamma) * np.sin(psi) / r if r > 0 else 0


    psi_dot = 0 # Assuming no significant yaw maneuvers during descent

    # Velocity derivative - thrust opposes gravity for controlled descent
    a_thrust = T / m if m > 0 else 0
    a_gravity = -g  # Gravity pulls downward

    # Ensure gamma is within valid range for trigonometric functions
    gamma_rad = np.clip(gamma, -np.pi/2, np.pi/2)

    # For descent: thrust works against gravity, positive thrust slows descent
    # Use abs(gamma) for thrust component along velocity vector direction
    v_dot = -a_thrust + a_gravity * np.sin(gamma_rad)  

    return [r_dot, theta_dot, phi_dot, v_dot, gamma_dot, psi_dot, mdot]

# Event function for reaching surface
def reach_surface(t, state):
    r, theta, phi, v, gamma, psi, m = state
    return r - Re
reach_surface.terminal = True
reach_surface.direction = -1  # Trigger when crossing from above



# Run the simulations
# 1. CSM orbit - generate positions for the entire mission
mission_start = datetime.datetime(1969, 7, 20, 17, 0, 0)  # Approximate
descent_start_time = datetime.datetime(1969, 7, 20, 19, 8, 0)  # Start of descent at 19:08 UT
pdi_time = datetime.datetime(1969, 7, 20, 20, 5, 0)  # Powered Descent Initiation at 20:05 UT
landing_time = datetime.datetime(1969, 7, 20, 20, 17, 40)  # Actual landing time
mission_end = landing_time + datetime.timedelta(hours=2) # End mission 2 hours after landing for simplicity

total_mission_time = (mission_end - mission_start).total_seconds()
csm_times = np.linspace(0, total_mission_time, 1000)
csm_initial_phase = 0  # Starting position of CSM (45 degrees back from 0)
csm_positions = np.array([csm_orbit(t, csm_initial_phase) for t in csm_times])
csm_x, csm_y, csm_z, csm_phases = csm_positions.T

# Calculate PDI time in seconds from descent start
pdi_seconds = (pdi_time - descent_start_time).total_seconds()
total_descent_time = (landing_time - descent_start_time).total_seconds()

# 2. Descent stage - from CSM orbit to surface
# Initial state: [radius, longitude, latitude, velocity, flight_path_angle, heading, mass]
descent_initial_state = [
    csm_radius,               # Initial radius (CSM orbit)
    launch_longitude + 0.9,   # Initial longitude (farther to the right for starting more on the x+ axis)
    launch_latitude,          # Initial latitude
    csm_velocity,             # Initial velocity (orbital velocity)
    -5 * deg,                 # Initial flight path angle (shallow descent)
    180 * deg,                # Initial heading (toward landing site)
    LM_Descent_m0             # Initial mass (descent stage only)
]

# Update simulation parameters to account for longer descent time
t_max_descent = total_descent_time + 100  # Add margin to the total descent time

print("Simulating descent trajectory...")
descent_sol = solve_ivp(
    descent_derivatives,
    [0, t_max_descent],
    descent_initial_state,
    method='RK45',
    events=[reach_surface],
    rtol=1e-6,
    atol=1e-8
)

descent_t = descent_sol.t
descent_r = np.maximum(descent_sol.y[0], Re)
descent_theta = descent_sol.y[1]
descent_phi = descent_sol.y[2]
descent_v = descent_sol.y[3]
descent_gamma = descent_sol.y[4]
descent_psi = descent_sol.y[5]
descent_m = descent_sol.y[6]

# Calculate PDI index in the solution for analysis
pdi_index = np.argmin(np.abs(descent_t - pdi_seconds))
print(f"Descent complete. Total descent time: {descent_t[-1]/60:.1f} minutes")
print(f"Pre-PDI time: {pdi_seconds/60:.1f} minutes, Post-PDI time: {(descent_t[-1] - pdi_seconds)/60:.1f} minutes")
print(f"Landing coordinates: {descent_phi[-1]/deg:.5f}°N, {descent_theta[-1]/deg:.5f}°E")
print(f"Distance from target: {Re * np.sqrt((descent_phi[-1] - launch_latitude)**2 + (descent_theta[-1] - launch_longitude)**2):.2f} m")
print(f"Final descent velocity: {descent_v[-1]:.2f} m/s")
print(f"Propellant remaining: {descent_m[-1] - LM_Descent_mstruc:.2f} kg")



# Calculate actual mission timestamps
surface_start_time = landing_time


# Create Cartesian coordinates for visualisation
# Convert spherical coordinates to cartesian for visualisation
def sphere_to_cart(r, theta, phi):
    x = r * np.cos(phi) * np.cos(theta)
    y = r * np.cos(phi) * np.sin(theta)
    z = r * np.sin(phi)
    return x, y, z

# CSM trajectory
csm_cart = np.array([sphere_to_cart(csm_radius, csm_phases[i], 0) for i in range(len(csm_times))])
csm_x, csm_y, csm_z = csm_cart.T


# Descent trajectory
descent_cart = np.array([
    sphere_to_cart(max(descent_r[i], Re), descent_theta[i], descent_phi[i])
    for i in range(len(descent_t))
])
descent_x, descent_y, descent_z = descent_cart.T



plt.figure(figsize=(15, 10))

# 2D plot of trajectories 
ax = plt.subplot(2, 2, 1)
moon_circle = plt.Circle((0, 0), Re, color='gray', alpha=0.5, label='Moon')
ax.add_patch(moon_circle)

ax.plot(csm_x, csm_y, 'b-', label='CSM Orbit')

ax.plot(descent_x, descent_y, 'r-', label='Descent')

ax.plot(descent_x[-1], descent_y[-1], 'yo', markersize=5, label='Landing Site')

ax.set_title('Mission Trajectory (Top-Down View)')
ax.set_xlabel('X (m)')
ax.set_ylabel('Y (m)')
ax.set_aspect('equal', adjustable='box') # Ensure circle looks like a circle
ax.legend()
ax.grid(True)

# Plot altitude vs time for descent
plt.subplot(2, 2, 2)
plt.plot(descent_t, descent_r - Re)
plt.axvline(x=pdi_seconds, color='r', linestyle='--', label='PDI')
plt.title('Descent: Altitude vs Time')
plt.xlabel('Time (s)')
plt.ylabel('Altitude (m)')
plt.legend()
plt.grid(True)


# plt.subplot(2, 2, 3) ...

# Plot velocity vs time (only descent)
plt.subplot(2, 2, 4) # Changed subplot index
plt.plot(descent_t, descent_v, 'r-', label='Descent')

# plt.plot(ascent_t, ascent_v, 'g-', label='Ascent')
# plt.axhline(y=v_target, color='b', linestyle='--', label='Orbit Velocity')
plt.title('Descent Velocity vs Time')
plt.xlabel('Time (s)')
plt.ylabel('Velocity (m/s)')
plt.grid(True)
plt.legend()

plt.tight_layout()
plt.show()

# Generate CZML for Cesium visualisation
czml = [
    {
        "id": "document",
        "name": "Apollo 11 Moon Mission (Descent)",
        "version": "1.0",
        "clock": {
            "interval": f"{mission_start.isoformat()}Z/{mission_end.isoformat()}Z",
            "currentTime": f"{mission_start.isoformat()}Z",
            "multiplier": 60,  # Speed up playback
            "range": "LOOP_STOP",
            "step": "SYSTEM_CLOCK_MULTIPLIER"
        }
    },
]

# Add CSM trajectory
csm_positions = []
csm_time_increment = total_mission_time / 1000
for i in range(len(csm_times)):
    time_seconds = csm_times[i]
    csm_positions.extend([time_seconds, csm_x[i], csm_y[i], csm_z[i]])

czml.append({
    "id": "CSM",
    "name": "Columbia CSM",
    "availability": f"{mission_start.isoformat()}Z/{mission_end.isoformat()}Z",
    "path": {
        "material": {
            "solidColor": {
                "color": {
                    "rgba": [0, 0, 255, 255]  # Blue
                }
            }
        },
        "width": 2,
        "leadTime": 0,
        "trailTime": csm_period,  # Show one orbit of trail
        "resolution": 120,
        "show": True
    },
    "position": {
        "interpolationAlgorithm": "LAGRANGE",
        "interpolationDegree": 2,
        "epoch": f"{mission_start.isoformat()}Z",
        "cartesian": csm_positions
    },
    "model": {
        "gltf": "/models/csm/csm.gltf",
        "minimumPixelSize": 64,
        "maximumScale": 20000
    },
    "label": {
        "text": "Columbia CSM",
        "font": "11pt Lucida Console",
        "style": "FILL_AND_OUTLINE",
        "outlineWidth": 2,
        "outlineColor": {
            "rgba": [0, 0, 0, 255]
        },
        "horizontalOrigin": "LEFT",
        "verticalOrigin": "TOP",
        "pixelOffset": {
            "cartesian2": [10, 0]
        },
        "fillColor": {
            "rgba": [255, 255, 255, 255]
        },
        "show": True
    }
})

# Add LM Descent trajectory
descent_positions = []
for i in range(len(descent_t)):
    time_seconds = descent_t[i]
    descent_positions.extend([time_seconds, descent_x[i], descent_y[i], descent_z[i]])

czml.append({
    "id": "LM_Descent",
    "name": "Eagle Descent",
    "availability": f"{descent_start_time.isoformat()}Z/{landing_time.isoformat()}Z",
    "path": {
        "material": {
            "solidColor": {
                "color": {
                    "rgba": [255, 0, 0, 255]  # Red
                }
            }
        },
        "width": 3,
        "leadTime": 0,
        "trailTime": 600,  # Show 10 min of trail
        "show": True
    },
    "position": {
        "interpolationAlgorithm": "LAGRANGE",
        "interpolationDegree": 2,
        "epoch": f"{descent_start_time.isoformat()}Z",
        "cartesian": descent_positions
    },
    "model": {
        "gltf": "/models/lm/lunarmodule.gltf",
        "minimumPixelSize": 64,
        "maximumScale": 20000
    },
    "label": {
        "text": "Eagle LM (Descent)",
        "show": True
    }
})

# Add surface stay (until mission end)
landing_site_x, landing_site_y, landing_site_z = sphere_to_cart(Re, descent_theta[-1], descent_phi[-1])

czml.append({
    "id": "LM_Surface",
    "name": "Eagle on Surface",
    "availability": f"{landing_time.isoformat()}Z/{mission_end.isoformat()}Z", # Changed end time
    "position": {
        "cartesian": [landing_site_x, landing_site_y, landing_site_z]
    },
    "model": {
        "gltf": "/models/lm/lunarmodule_up.gltf",
        "minimumPixelSize": 64,
        "maximumScale": 20000
    },
    "label": {
        "text": "Tranquility Base",
        "show": True
    },
    "point": {
        "color": {
            "rgba": [255, 255, 0, 255]
        },
        "outlineColor": {
            "rgba": [0, 0, 0, 255]
        },
        "outlineWidth": 2,
        "pixelSize": 10,
        "show": True
    }
})



# Write CZML to file
czml_file_path = os.path.join(os.path.dirname(__file__), "apollo11_mission_descent.czml") # Changed filename
with open(czml_file_path, "w") as czml_file:
    json.dump(czml, czml_file, indent=2)

print(f"CZML file written to {czml_file_path}")