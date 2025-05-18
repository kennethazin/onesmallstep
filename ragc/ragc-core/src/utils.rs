pub enum Option<T> {
    None,
    Some(T),
}

pub fn overflow_correction(a: u16) -> u16 {
    let newa = match 0xC000 & a {
        0x8000 => a | 0xC000,
        0x4000 => a & 0x3FFF,
        _ => a,
    };
    newa
}
pub fn sign_extend(k: u16) -> u16 {
    let bit = k & 0x4000;
    if bit != 0 {
        let v = k | 0x8000;
        v
    } else {
        let v = k & 0x7FFF;
        v
    }
}
#[allow(dead_code)]
pub fn s15_ones_to_twos(val: u16) -> u16 {
    if val & 0x4000 == 0x4000 {
        (val + 1) & 0x7FFF
    } else {
        val & 0x7FFF
    }
}

pub fn s15_add(a: u16, b: u16) -> u16 {
    let mut res = a as u32 + b as u32;
    if res & 0o100000 == 0o100000 {
        res += 1;
    }
    (res & 0o77777) as u16
}

pub fn s16_add(a: u16, b: u16) -> u16 {
    let mut res = a as u32 + b as u32;
    if res & 0xFFFF0000 != 0x00000000 {
        res += 1;
    }
    (res & 0o177777) as u16
}

pub fn _dp_add(a: u32, b: u32) -> u32 {
    let mut res = a + b;
    if res & 0xE0000000 != 0x0 {
        res += 1;
    }
    res
}

pub fn cpu_to_agc_sp(cpu_val: i16) -> u16 {
    if cpu_val <= 0 {
        !((cpu_val * -1) as u16)
    } else {
        cpu_val as u16
    }
}

pub fn agc_sp_to_cpu(agc_val: u16) -> i16 {
    if agc_val & 0o040000 != 0 {
        -(((!agc_val) & 0o037777) as i16)
    } else {
        (agc_val & 0o37777) as i16
    }
}

pub fn agc_dp_to_cpu(agc_val: u32) -> i32 {
    if agc_val & 0o2000000000 != 0 {
        -(((!agc_val) & 0o1777777777) as i32)
    } else {
        (agc_val & 0o1777777777) as i32
    }
}
