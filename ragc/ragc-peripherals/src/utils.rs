#[allow(dead_code)]
const SEVEN_SEG_TABLE: [u8; 11] = [
    // 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, BLANK
    0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x00,
];

#[allow(dead_code)]
pub fn get_7seg(agc_val: u8) -> u8 {
    match agc_val {
        0 => SEVEN_SEG_TABLE[10],
        21 => SEVEN_SEG_TABLE[0],
        3 => SEVEN_SEG_TABLE[1],
        25 => SEVEN_SEG_TABLE[2],
        27 => SEVEN_SEG_TABLE[3],
        15 => SEVEN_SEG_TABLE[4],
        30 => SEVEN_SEG_TABLE[5],
        28 => SEVEN_SEG_TABLE[6],
        19 => SEVEN_SEG_TABLE[7],
        29 => SEVEN_SEG_TABLE[8],
        31 => SEVEN_SEG_TABLE[9],
        _ => SEVEN_SEG_TABLE[10],
    }
}
#[allow(dead_code)]
pub fn get_7seg_value(c: u8, d: u8) -> u16 {
    let mut res: u16 = get_7seg(c) as u16;
    res = res << 8 | get_7seg(d) as u16;
    res
}
