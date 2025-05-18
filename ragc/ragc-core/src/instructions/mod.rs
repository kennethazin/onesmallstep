pub mod instructions;

pub use instructions::Instructions;

const DATA_MASK: u16 = 0o7777;
const DATA_MASK_RAM: u16 = 0o1777;
const OPCODE_MASK: u16 = 0o7;
const OPCODE_OFFSET: u16 = 12;
const OPCODE_EXTEND_MASK: u16 = 0o100000;

#[derive(Debug)]
pub enum AgcMnem {
    AD,
    ADS,
    AUG,
    BZF,
    BZMF,
    CA,
    CS,
    CCS,
    DAS,
    DCA,
    DCS,
    DIM,
    DV,
    DXCH,
    EDRUPT,
    EXTEND,
    INCR,
    INDEX,
    INHINT,
    LXCH,
    MASK,
    MP,
    MSU,
    QXCH,
    RAND,
    READ,
    RELINT,
    RESUME,
    ROR,
    RXOR,
    SU,
    TC,
    TCF,
    TS,
    WAND,
    WOR,
    WRITE,
    XCH,
    INVALID,
}

#[derive(Debug)]
pub struct AgcInst {
    pub pc: u16,
    pub mnem: AgcMnem,
    pub inst_data: u16,
    pub extrabits: Option<u8>,
    pub mct: u8,
}

impl AgcInst {
    #[allow(dead_code)]
    pub fn new() -> AgcInst {
        AgcInst {
            pc: 0o00000,
            inst_data: 0o00000,
            mnem: AgcMnem::INVALID,
            extrabits: None,
            mct: 1,
        }
    }

    pub fn get_opcode_bits(&self) -> u8 {
        ((self.inst_data >> OPCODE_OFFSET) & OPCODE_MASK) as u8
    }

    pub fn get_data_bits(&self) -> u16 {
        (self.inst_data & DATA_MASK) as u16
    }

    pub fn get_kaddr(&self) -> usize {
        (self.inst_data & DATA_MASK) as usize
    }

    pub fn get_kaddr_ram(&self) -> usize {
        let v = (self.inst_data & DATA_MASK_RAM) as usize;
        v
    }
    pub fn is_extended(&self) -> bool {
        let val = self.inst_data & OPCODE_EXTEND_MASK;
        if val == OPCODE_EXTEND_MASK {
            true
        } else {
            false
        }
    }
}
