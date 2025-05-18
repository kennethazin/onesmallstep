#![no_std]

const ROM_BANKS_NUM: usize = 36;
const ROM_BANK_NUM_WORDS: usize = 1024;

macro_rules! transmute {
    ($file:expr) => {
        &core::mem::transmute(*include_bytes!($file))
    };
}
pub static RETREAD50_ROPE: &'static [[u16; ROM_BANK_NUM_WORDS]; ROM_BANKS_NUM] =
    unsafe { transmute!("../RETREAD50.bin") };
