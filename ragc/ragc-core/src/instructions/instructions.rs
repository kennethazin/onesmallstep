use super::AgcInst;
use crate::consts::cpu::*;
use crate::cpu::AgcCpu;
use crate::utils;
use crate::utils::{overflow_correction, sign_extend};
use log::{debug, error, trace, warn};

fn s15_abs(value: u16) -> u16 {
    if value & 0o40000 == 0o40000 {
        !value & 0o77777
    } else {
        value & 0o77777
    }
}

fn convert_to_dp(upper: u16, lower: u16) -> u32 {
    let zero_list = [0o77777, 0o00000];
    if zero_list.contains(&upper) {
        if lower & 0o40000 == 0o40000 {
            lower as u32 | 0o17777700000
        } else {
            lower as u32
        }
    } else {
        match (upper & 0o40000) == (lower & 0o40000) {
            true => (upper as u32) << 14 | (lower & 0o37777) as u32,
            false => {
                let mut res = if lower & 0o40000 == 0o40000 {
                    let mut val: u32 = crate::utils::s15_add(upper, 0o77776) as u32;
                    val = val << 14;

                    val |= crate::utils::s15_add(lower, 0o40000) as u32;
                    val
                } else {
                    let mut val: u32 = crate::utils::s15_add(upper, 0o00001) as u32;
                    val = val << 14;
                    val |= crate::utils::s15_add(lower, 0o37777) as u32;
                    val
                };

                if res & 0o4000000000 == 0o4000000000 {
                    res += 1;
                }
                res & 0o3777777777
            }
        }
    }
}

pub trait Instructions {
    fn ad(&mut self, inst: &AgcInst) -> u16;
    fn ads(&mut self, inst: &AgcInst) -> u16;
    fn das(&mut self, inst: &AgcInst) -> u16;
    fn aug(&mut self, inst: &AgcInst) -> u16;
    fn mp(&mut self, inst: &AgcInst) -> u16;
    fn su(&mut self, inst: &AgcInst) -> u16;
    fn msu(&mut self, inst: &AgcInst) -> u16;
    fn incr(&mut self, inst: &AgcInst) -> u16;
    fn dim(&mut self, inst: &AgcInst) -> u16;
    fn dv(&mut self, inst: &AgcInst) -> u16;
    fn mask(&mut self, inst: &AgcInst) -> u16;
    fn cs(&mut self, inst: &AgcInst) -> u16;
    fn ca(&mut self, inst: &AgcInst) -> u16;
    fn dcs(&mut self, inst: &AgcInst) -> u16;
    fn dca(&mut self, inst: &AgcInst) -> u16;
    fn xch(&mut self, inst: &AgcInst) -> u16;
    fn dxch(&mut self, inst: &AgcInst) -> u16;
    fn lxch(&mut self, inst: &AgcInst) -> u16;
    fn qxch(&mut self, inst: &AgcInst) -> u16;
    fn ts(&mut self, inst: &AgcInst) -> u16;
    fn ror(&mut self, inst: &AgcInst) -> u16;
    fn rand(&mut self, inst: &AgcInst) -> u16;
    fn wor(&mut self, inst: &AgcInst) -> u16;
    fn wand(&mut self, inst: &AgcInst) -> u16;
    fn read_instr(&mut self, inst: &AgcInst) -> u16;
    fn write_instr(&mut self, inst: &AgcInst) -> u16;
    fn rxor(&mut self, inst: &AgcInst) -> u16;
    fn inhint(&mut self, inst: &AgcInst) -> u16;
    fn relint(&mut self, inst: &AgcInst) -> u16;
    fn edrupt(&mut self, inst: &AgcInst) -> u16;
    fn resume(&mut self, inst: &AgcInst) -> u16;
    fn tcf(&mut self, inst: &AgcInst) -> u16;
    fn bzf(&mut self, inst: &AgcInst) -> u16;
    fn bzmf(&mut self, inst: &AgcInst) -> u16;
    fn ccs(&mut self, inst: &AgcInst) -> u16;
    fn tc(&mut self, inst: &AgcInst) -> u16;
}

impl<'a> Instructions for AgcCpu<'a> {
    fn ad(&mut self, inst: &AgcInst) -> u16 {
        let a = self.read_s16(REG_A) as u16;
        let k = self.read_s16(inst.get_kaddr()) as u16;

        let mut res: u32 = a as u32 + k as u32;
        if res & 0xFFFF0000 != 0 {
            res += 1;
        }

        self.write_s16(REG_A, (res & 0xFFFF) as u16);
        self.check_editing(inst.get_kaddr());
        2
    }

    fn ads(&mut self, inst: &AgcInst) -> u16 {
        let a = self.read_s16(REG_A) as u32;
        let k = self.read_s16(inst.get_kaddr_ram());

        let mut res: u32 = a as u32 + k as u32;
        if res & 0xFFFF0000 != 0 {
            res += 1;
        }

        let newval = (res & 0xFFFF) as u16;
        self.write_s16(REG_A, newval);
        self.write_s16(inst.get_kaddr_ram(), newval);
        2
    }

    fn das(&mut self, inst: &AgcInst) -> u16 {
        let mut k = inst.get_kaddr_ram();
        if k > 0 {
            k -= 1;
        }

        let a = self.read_s16(REG_A);
        let l = self.read_s16(REG_L);

        let word1 = self.read_s16(k);
        let word2 = self.read_s16(k + 1);

        let mut res_upper = crate::utils::s16_add(a, word1);
        let mut res_lower = crate::utils::s16_add(l, word2);

        match res_lower & 0o140000 {
            0o040000 => {
                res_upper = crate::utils::s16_add(res_upper, 0o00001);
                res_lower = crate::utils::overflow_correction(res_lower);
            }
            0o100000 => {
                res_upper = crate::utils::s16_add(res_upper, 0o177776);
                res_lower = crate::utils::overflow_correction(res_lower);
            }
            _ => {}
        };

        self.write_s16(REG_L, 0);
        match res_upper & 0o140000 {
            0o040000 => {
                self.write_s16(REG_A, 0o000001);
            }
            0o100000 => {
                self.write_s16(REG_A, 0o177776);
            }
            _ => {
                self.write_s16(REG_A, 0o000000);
            }
        }

        self.write_s16(k, res_upper);
        self.write_s16(k + 1, res_lower);
        3
    }

    fn aug(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr_ram();

        match k {
            REG_A | REG_Q => {
                let v = self.read_s16(k as usize);
                let newv = match v & 0o100000 {
                    0o100000 => v - 1,
                    0o000000 => v + 1,
                    _ => {
                        error! {"This should be hit"};
                        0
                    }
                };
                self.write_s16(k as usize, newv);
            }
            _ => {
                let v = self.read_s15(k as usize);
                let newv = match v & 0o40000 {
                    0o40000 => v - 1,
                    0o00000 => v + 1,
                    _ => {
                        error! {"This should be hit"};
                        0
                    }
                };
                self.write_s15(k as usize, newv);
            }
        }

        2
    }

    fn mp(&mut self, inst: &AgcInst) -> u16 {
        let a = self.read_s15(REG_A);
        let a_sign = a & 0o40000;
        let a_mag = if a_sign != 0o0 {
            (!a) & 0o37777
        } else {
            a & 0o37777
        };

        let k = self.read_s15(inst.get_kaddr());
        let k_sign = k & 0o40000;
        let k_mag = if k_sign != 0o0 {
            (!k) & 0o37777
        } else {
            k & 0o37777
        };

        let mut res = (a_mag as u32 * k_mag as u32) & 0o1777777777;
        if k_sign != a_sign {
            match res {
                0o0000000000 | 0o1777777777 => {
                    if (a_mag == 0o0 || a_mag == 0o77777) && (k_mag != 0o0 && k_mag != 0o77777) {
                        res = 0o3777777777;
                    } else {
                        res = 0o0000000000;
                    }
                }
                _ => {
                    res = (!res) & 0o3777777777;
                }
            }
        }
        self.write_dp(REG_A, res);
        3
    }

    fn incr(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr_ram();
        let val: u32 = self.read(k) as u32;
        trace!("INCR: {:x}: {:x}", k, val);

        let kval = match k {
            REG_A | REG_Q => match val {
                0o077777 => val & 0o177777,
                0o177777 => 0o000001,
                _ => (val + 1) & 0o177777,
            },
            _ => match val {
                0o37777 => 0o00000,
                0o77777 => 0o00001,
                _ => (val + 1) & 0o77777,
            },
        };

        self.write(k, (kval & 0o177777) as u16);
        2
    }

    fn su(&mut self, inst: &AgcInst) -> u16 {
        let a = self.read_s16(REG_A);
        let kval = !self.read_s16(inst.get_kaddr_ram());
        let mut res: u32 = a as u32 + kval as u32;
        if res & 0xFFFF0000 != 0x00000000 {
            res += 1;
        }
        self.write_s16(REG_A, (res & 0xFFFF) as u16);
        self.check_editing(inst.get_kaddr_ram());
        2
    }

    fn msu(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr_ram();
        match k {
            REG_A | REG_Q => {
                let kval = !self.read_s16(k);
                let aval = self.read_s16(REG_A);
                let mut res = (kval as u32 + aval as u32 + 1) & 0o177777;
                if res & 0o100000 == 0o100000 {
                    res = (res + 0o177777) & 0o177777;
                }

                trace!("MSU16: A2{:6o} - K2{:6o} = A1{:6o}", aval, kval, res);
                self.write_s16(REG_A, (res & 0o177777) as u16);
            }
            _ => {
                let kval = !self.read_s15(k) & 0o77777;
                let aval = self.read_s15(REG_A);
                let mut res = (kval + 1 + aval) & 0o77777;
                if res & 0o40000 == 0o40000 {
                    res = (res + 0o77777) & 0o77777;
                }

                trace!("MSU15: A2{:5o} - K2{:5o} = A1{:5o}", aval, kval, res);
                self.write_s15(REG_A, res);
            }
        }

        self.check_editing(k);
        2
    }

    fn dim(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr_ram();
        let kval = self.read_s16(k);
        debug!("DIM: {:x}: {:x}", k, kval);

        match kval {
            0o177777 | 0o00000 => {}

            _ => {
                if kval & 0o40000 == 0o40000 {
                    self.write_s16(k, kval + 1);
                } else {
                    if kval - 1 == 0 {
                        self.write_s16(k, 0o177777);
                    } else {
                        self.write_s16(k, kval - 1);
                    }
                }
            }
        };

        2
    }

    fn dv(&mut self, inst: &AgcInst) -> u16 {
        let zero_list = [0o77777, 0o00000];

        let divisor = self.read_s15(inst.get_kaddr_ram());
        let dividend_upper = self.read_s15(REG_A);
        let dividend_lower = self.read_s15(REG_L);

        let divisor_sign = divisor & 0o40000;
        let dividend_sign = if zero_list.contains(&dividend_upper) {
            dividend_lower & 0o40000
        } else {
            dividend_upper & 0o40000
        };

        if zero_list.contains(&dividend_upper) && zero_list.contains(&dividend_lower) {
            if !zero_list.contains(&divisor) {
                if dividend_sign ^ divisor_sign == 0o00000 {
                    self.write_s15(REG_A, 0o00000);
                } else {
                    self.write_s15(REG_A, 0o77777);
                }
            } else {
                if dividend_sign ^ divisor_sign == 0o00000 {
                    self.write_s15(REG_A, 0o37777);
                } else {
                    self.write_s15(REG_A, 0o40000);
                }
            };
            return 6;
        };

        if s15_abs(dividend_upper) == s15_abs(divisor) {
            if zero_list.contains(&dividend_lower) {
                if dividend_sign ^ divisor_sign == 0o00000 {
                    self.write_s15(REG_A, 0o37777);
                } else {
                    self.write_s15(REG_A, 0o40000);
                }
                self.write_s15(REG_L, dividend_upper);
                return 6;
            } else {
                log::warn!("Undefined behavior for DV!");
            }

            return 6;
        }

        let dividend = convert_to_dp(dividend_upper, dividend_lower);
        let cpu_dividend = crate::utils::agc_dp_to_cpu(dividend);
        let cpu_divisor = crate::utils::agc_sp_to_cpu(divisor);

        let cpu_quotent = cpu_dividend / (cpu_divisor as i32);
        let cpu_remainder = cpu_dividend % (cpu_divisor as i32);

        self.write_s16(REG_A, crate::utils::cpu_to_agc_sp(cpu_quotent as i16));
        match cpu_remainder {
            0 => {
                if dividend_sign == 0o40000 {
                    self.write_s15(REG_L, 0o77777);
                } else {
                    self.write_s15(REG_L, 0o00000);
                }
            }
            _ => {
                self.write_s15(REG_L, crate::utils::cpu_to_agc_sp(cpu_remainder as i16));
            }
        }

        6
    }
    fn mask(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr();
        match k {
            REG_A | REG_Q => {
                let mut val = self.read_s16(k);
                val = self.read_s16(REG_A) & val;
                self.write_s16(REG_A, val);
            }
            _ => {
                let val = self.read_s15(k);
                let a = self.read_s15(REG_A);
                let n = a & (val & 0x7FFF);
                self.write_s15(REG_A, n & 0x7FFF);
            }
        };
        2
    }

    fn cs(&mut self, inst: &AgcInst) -> u16 {
        let addr: usize = inst.get_data_bits() as usize;
        let mut val = self.read_s16(addr);
        val = !val;
        val = val & 0xFFFF;
        self.write_s16(REG_A, val);
        self.check_editing(inst.get_kaddr());
        2
    }

    fn dcs(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr() - 1;

        let val_l = (!self.read_s16(k + 1)) & 0xFFFF;
        self.write(REG_L, val_l);

        let val_a = (!self.read_s16(k)) & 0xFFFF;
        self.write(REG_A, val_a);

        self.check_editing(k + 1);
        self.check_editing(k);

        3
    }

    fn dca(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr() - 1;

        let val_l = self.read_s16(k + 1);
        self.write_s16(REG_L, val_l);

        let val_a = self.read_s16(k);
        self.write_s16(REG_A, val_a);

        self.check_editing(k + 1);
        self.check_editing(k);

        3
    }

    fn dxch(&mut self, inst: &AgcInst) -> u16 {
        let kaddr = inst.get_kaddr_ram() - 1;

        let l = self.read_s16(REG_L);
        let k2 = self.read_s16(kaddr + 1);
        self.write_s16(REG_L, k2);
        self.write_s16(kaddr + 1, l);

        let a = self.read_s16(REG_A);
        let k1 = self.read_s16(kaddr);
        self.write_s16(REG_A, k1);
        self.write_s16(kaddr, a);

        match inst.get_kaddr_ram() {
            5 | 6 => {
                let idx = self.read(REG_Z) as usize;
                self.ir = self.read(idx);
            }
            _ => {}
        }

        3
    }

    fn lxch(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr_ram();

        let lval = self.read_s16(REG_L);
        let kval = self.read_s16(k);

        self.write_s16(REG_L, kval);
        self.write_s16(k, lval);

        2
    }

    fn ca(&mut self, inst: &AgcInst) -> u16 {
        let addr: usize = inst.get_data_bits() as usize;
        let val = self.read_s16(addr);
        self.write_s16(REG_A, val);
        self.check_editing(addr);
        2
    }

    fn ts(&mut self, inst: &AgcInst) -> u16 {
        let addr = inst.get_kaddr_ram();
        let a = self.read_s16(REG_A);

        match a & 0xC000 {
            // Negative Overflow Scenario
            0x8000 => {
                self.write_s16(REG_A, 0xFFFE);
                let val = self.read(REG_PC) + 1;
                self.update_pc(val);
            }
            // Positive Overflow Scenario
            0x4000 => {
                self.write_s16(REG_A, 0x0001);
                let val = self.read(REG_PC) + 1;
                self.update_pc(val);
            }
            _ => {}
        };

        self.write_s16(addr, a);
        self.read(addr);
        2
    }

    fn qxch(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr_ram();
        let v = self.read_s16(k as usize);
        let v_q = self.read_s16(REG_LR);

        self.write_s16(k as usize, v_q);
        self.write_s16(REG_LR, v);
        2
    }

    fn xch(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_kaddr_ram();
        let v = self.read_s16(k);
        let v_q = self.read_s16(REG_A);

        debug!(
            "XCH: {:x} {:x} {:x}",
            k,
            utils::sign_extend(v),
            utils::overflow_correction(v_q)
        );
        self.write_s16(k, utils::overflow_correction(v_q));
        self.write_s16(REG_A, v);
        2
    }

    fn ror(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_data_bits() & 0x1FF;
        let io_val = self.read_io(k as usize);

        match k {
            2 => {
                let val = self.read_s16(REG_A) | io_val;
                self.write_s16(REG_A, val);
            }
            _ => {
                let n = self.read_s15(REG_A) | (io_val & 0x7FFF);
                self.write_s15(REG_A, n & 0x7FFF);
            }
        };
        2
    }

    fn rand(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_data_bits() & 0x1FF;
        let io_val = self.read_io(k as usize);

        match k {
            2 => {
                let val = self.read_s16(REG_A) & io_val;
                self.write_s16(REG_A, val);
            }
            _ => {
                let n = self.read_s15(REG_A) & (io_val & 0x7FFF);
                self.write_s15(REG_A, n & 0x7FFF);
            }
        };
        2
    }
    fn rxor(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_data_bits() & 0x1FF;
        let io_val = self.read_io(k as usize);

        match k {
            2 => {
                let val = self.read_s16(REG_A) ^ io_val;
                self.write_s16(REG_A, val);
            }
            _ => {
                let n = self.read_s15(REG_A) ^ (io_val & 0x7FFF);
                self.write_s15(REG_A, n & 0x7FFF);
            }
        };
        2
    }
    fn wor(&mut self, inst: &AgcInst) -> u16 {
        let k: usize = (inst.get_data_bits() & 0x1FF) as usize;
        let io_val = self.read_io(k);

        match k {
            2 => {
                let n = self.read_s16(REG_A) | io_val;
                debug!("WOR: {:06o} | {:06o} => {:06o}", k, io_val, n);
                self.write_s16(REG_A, n);
                self.write_io(k, n);
            }
            _ => {
                let n = self.read_s15(REG_A) | (io_val & 0x7FFF);
                debug!("WOR: {:06o} | {:06o} => {:06o}", k, io_val, n);
                self.write_s15(REG_A, n);
                self.write_io(k, n & 0x7FFF);
            }
        };
        2
    }
    fn wand(&mut self, inst: &AgcInst) -> u16 {
        let k: usize = (inst.get_data_bits() & 0x1FF) as usize;
        let io_val = self.read_io(k);

        match k {
            2 => {
                let n = self.read_s16(REG_A) & io_val;
                self.write_s16(REG_A, n);
                self.write_io(k, n);
            }
            _ => {
                let n = self.read_s15(REG_A) & (io_val & 0x7FFF);
                self.write_s15(REG_A, n);
                self.write_io(k, n & 0x7FFF);
            }
        };
        2
    }
    fn read_instr(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_data_bits() & 0x1FF;
        let io_val = match k {
            2 => self.read_io(k as usize),
            _ => sign_extend(self.read_io(k as usize)),
        };
        self.write_s16(REG_A, io_val);
        2
    }
    fn write_instr(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_data_bits() & 0x1FF;
        let val = self.read_s16(REG_A);
        match k {
            2 => {
                self.write_io(k as usize, val);
            }
            _ => {
                self.write_io(k as usize, overflow_correction(val) & 0x7FFF);
            }
        }
        2
    }
    fn inhint(&mut self, _inst: &AgcInst) -> u16 {
        self.gint = false;
        1
    }

    fn relint(&mut self, _inst: &AgcInst) -> u16 {
        self.gint = true;
        1
    }

    fn edrupt(&mut self, _inst: &AgcInst) -> u16 {
        self.gint = false;
        3
    }

    fn resume(&mut self, _inst: &AgcInst) -> u16 {
        let val = self.read(REG_PC_SHADOW) - 1;
        self.write(REG_PC, val);
        self.ir = self.read(REG_IR);
        self.idx_val = 0;
        self.gint = true;
        self.is_irupt = false;

        2
    }
    fn bzf(&mut self, inst: &AgcInst) -> u16 {
        self.ec_flag = false;

        let a = self.read(REG_A);
        match a {
            0 | 0xFFFF => {
                let next_addr = inst.get_data_bits() & 0xFFF;
                if (next_addr & 0xC00) == 0x0 {
                    warn!("BZF jumping to non-fixed memory!");
                }

                self.write(REG_PC, next_addr);
                self.ir = self.read(next_addr as usize);
                1
            }
            _ => 2,
        }
    }

    fn tcf(&mut self, inst: &AgcInst) -> u16 {
        let next_addr = inst.get_data_bits();
        self.update_pc(next_addr);
        self.ec_flag = false;
        1
    }

    fn bzmf(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_data_bits();
        match k & 0xC00 {
            0x000 => {
                error!("Invalid encoding for BZMF");
                return 0;
            }
            _ => {}
        }

        let a = self.read_s16(REG_A);
        match a {
            _ if a > 0x0000 && a < 0x8000 => 2,
            _ => {
                self.write(REG_PC, k);
                self.ir = self.read(k as usize);
                self.ec_flag = false;
                1
            }
        }
    }

    fn ccs(&mut self, inst: &AgcInst) -> u16 {
        let pc = self.read(REG_PC);
        let k = inst.get_kaddr_ram();
        let mut a = self.read_s16(k);
        match a {
            0o000000 => {
                self.write(REG_PC, pc + 1);
                self.ir = self.read((pc + 1) as usize);
                self.write(REG_A, 0);
            }
            0o177777 => {
                self.write(REG_PC, pc + 3);
                self.ir = self.read((pc + 3) as usize);
                self.write(REG_A, 0);
            }
            0o000001..=0o077777 => {
                self.write(REG_PC, pc);
                self.ir = self.read(pc as usize);
                self.write(REG_A, a - 1);
            }
            0o100000..=0o177776 => {
                self.write(REG_PC, pc + 2);
                self.ir = self.read((pc + 2) as usize);
                a = a ^ 0xFFFF;
                self.write(REG_A, a - 1);
            }
        };

        self.check_editing(k);

        2
    }

    fn tc(&mut self, inst: &AgcInst) -> u16 {
        let k = inst.get_data_bits();
        let pc = self.read(REG_PC);

        self.update_pc(k);

        self.write(REG_LR, pc);
        self.ec_flag = false;

        1
    }
}
